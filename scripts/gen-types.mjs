#!/usr/bin/env node
/**
 * Generates TypeScript types for the public schema straight from the Postgres
 * catalog — no Docker, no Supabase CLI, no extra credentials.
 *
 * (`supabase gen types` runs postgres-meta in a container; this reads
 * information_schema/pg_catalog over the connection we already have.)
 *
 * Emits Row / Insert / Update per table plus Enums, in the shape the Supabase
 * client expects: createClient<Database>(...).
 *
 * Usage: node --env-file=.env.local scripts/gen-types.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "shared",
  "types",
  "database.types.ts",
);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const u = new URL(url);
const client = new pg.Client({
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  host: u.hostname,
  port: Number(u.port) || 5432,
  database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});

/** Postgres udt_name → TypeScript. */
const SCALARS = new Map([
  ["uuid", "string"], ["text", "string"], ["citext", "string"],
  ["varchar", "string"], ["bpchar", "string"], ["char", "string"],
  ["name", "string"],
  ["int2", "number"], ["int4", "number"], ["int8", "number"],
  ["numeric", "number"], ["float4", "number"], ["float8", "number"],
  ["bool", "boolean"],
  ["timestamptz", "string"], ["timestamp", "string"], ["date", "string"],
  ["time", "string"], ["timetz", "string"], ["interval", "string"],
  ["json", "Json"], ["jsonb", "Json"],
  ["inet", "string"], ["cidr", "string"], ["macaddr", "string"],
  ["bytea", "string"], ["tsvector", "string"], ["oid", "number"],
]);

const pascal = (s) => s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());

await client.connect();

const { rows: enumRows } = await client.query(`
  select t.typname as name, e.enumlabel as label
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  order by t.typname, e.enumsortorder
`);

const enums = new Map();
for (const { name, label } of enumRows) {
  if (!enums.has(name)) enums.set(name, []);
  enums.get(name).push(label);
}

const { rows: cols } = await client.query(`
  select c.table_name, c.column_name, c.udt_name, c.is_nullable,
         c.column_default, c.ordinal_position
  from information_schema.columns c
  join information_schema.tables t
    on t.table_name = c.table_name and t.table_schema = c.table_schema
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by c.table_name, c.ordinal_position
`);

await client.end();

function tsType(udt) {
  const isArray = udt.startsWith("_");
  const base = isArray ? udt.slice(1) : udt;
  let type;
  if (enums.has(base)) type = `Database["public"]["Enums"]["${base}"]`;
  else type = SCALARS.get(base) ?? "unknown";
  return isArray ? `${type}[]` : type;
}

const tables = new Map();
for (const c of cols) {
  if (!tables.has(c.table_name)) tables.set(c.table_name, []);
  tables.get(c.table_name).push(c);
}

const lines = [];
lines.push(`/**`);
lines.push(` * BEAMS database types — GENERATED. Do not edit by hand.`);
lines.push(` * Regenerate after any migration:  npm run db:types`);
lines.push(` * Source: live Postgres catalog (${tables.size} tables, ${enums.size} enums).`);
lines.push(` */`);
lines.push("");
lines.push(`export type Json =`);
lines.push(`  | string`);
lines.push(`  | number`);
lines.push(`  | boolean`);
lines.push(`  | null`);
lines.push(`  | { [key: string]: Json | undefined }`);
lines.push(`  | Json[];`);
lines.push("");
lines.push(`export type Database = {`);
lines.push(`  public: {`);
lines.push(`    Tables: {`);

for (const [table, columns] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`      ${table}: {`);
  // Row
  lines.push(`        Row: {`);
  for (const c of columns) {
    const nullable = c.is_nullable === "YES" ? " | null" : "";
    lines.push(`          ${c.column_name}: ${tsType(c.udt_name)}${nullable};`);
  }
  lines.push(`        };`);
  // Insert — optional when nullable or defaulted
  lines.push(`        Insert: {`);
  for (const c of columns) {
    const optional = c.is_nullable === "YES" || c.column_default !== null ? "?" : "";
    const nullable = c.is_nullable === "YES" ? " | null" : "";
    lines.push(`          ${c.column_name}${optional}: ${tsType(c.udt_name)}${nullable};`);
  }
  lines.push(`        };`);
  // Update — everything optional
  lines.push(`        Update: {`);
  for (const c of columns) {
    const nullable = c.is_nullable === "YES" ? " | null" : "";
    lines.push(`          ${c.column_name}?: ${tsType(c.udt_name)}${nullable};`);
  }
  lines.push(`        };`);
  // supabase-js requires this key for query type inference; without it the
  // client resolves rows to `never`.
  lines.push(`        Relationships: [];`);
  lines.push(`      };`);
}

lines.push(`    };`);
lines.push(`    Views: { [_ in never]: never };`);
lines.push(`    Functions: { [_ in never]: never };`);
lines.push(`    Enums: {`);
for (const [name, labels] of [...enums].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`      ${name}: ${labels.map((l) => `"${l}"`).join(" | ")};`);
}
lines.push(`    };`);
lines.push(`    CompositeTypes: { [_ in never]: never };`);
lines.push(`  };`);
lines.push(`};`);
lines.push("");

// Convenience aliases: Tables<"member">, Enums<"member_state">, etc.
lines.push(`/** Convenience helpers. */`);
lines.push(`export type Tables<T extends keyof Database["public"]["Tables"]> =`);
lines.push(`  Database["public"]["Tables"][T]["Row"];`);
lines.push(`export type TablesInsert<T extends keyof Database["public"]["Tables"]> =`);
lines.push(`  Database["public"]["Tables"][T]["Insert"];`);
lines.push(`export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =`);
lines.push(`  Database["public"]["Tables"][T]["Update"];`);
lines.push(`export type Enums<T extends keyof Database["public"]["Enums"]> =`);
lines.push(`  Database["public"]["Enums"][T];`);
lines.push("");

// Named row aliases for the entities we touch most.
for (const t of ["member", "assembly", "app_user", "role", "permission", "home_cell", "ministry"]) {
  if (tables.has(t)) lines.push(`export type ${pascal(t)} = Tables<"${t}">;`);
}
lines.push("");

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(
  `✅ Generated ${tables.size} tables + ${enums.size} enums → src/shared/types/database.types.ts`,
);
