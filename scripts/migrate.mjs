#!/usr/bin/env node
/**
 * BEAMS migration runner — applies supabase/migrations/*.sql to a Postgres
 * database in filename order, each file in its own transaction, tracked in
 * `_beams_migration` so re-runs are safe (idempotent at the file level).
 *
 * Works against a CLOUD Supabase project — no Docker, no Supabase CLI needed.
 *
 * Usage (Node 24 loads the env file natively):
 *   node --env-file=.env.local scripts/migrate.mjs           # migrations only
 *   node --env-file=.env.local scripts/migrate.mjs --seed    # + supabase/seed.sql
 *   node --env-file=.env.local scripts/migrate.mjs --status  # show what's applied
 *
 * Requires DATABASE_URL (Supabase → Project Settings → Database → Connection
 * string → URI). Secrets are never printed.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SEED_FILE = join(ROOT, "supabase", "seed.sql");

const args = process.argv.slice(2);
const RUN_SEED = args.includes("--seed");
const STATUS_ONLY = args.includes("--status");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "❌ DATABASE_URL is not set.\n" +
      "   Add it to .env.local (Supabase → Project Settings → Database →\n" +
      "   Connection string → URI), then run:\n" +
      "     node --env-file=.env.local scripts/migrate.mjs",
  );
  process.exit(1);
}

/**
 * Build the pg config from DATABASE_URL.
 *
 * Supabase's direct host (db.<ref>.supabase.co) publishes ONLY an AAAA record.
 * macOS getaddrinfo — which pg/net uses via dns.lookup — returns ENOTFOUND for
 * AAAA-only names even when IPv6 works. We detect that and substitute the
 * resolved IPv6 literal (net skips DNS for IP literals), keeping the original
 * hostname for TLS SNI.
 */
async function buildClientConfig(url) {
  const u = new URL(url);
  const hostname = u.hostname;
  const config = {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  };

  try {
    await dns.promises.lookup(hostname);
  } catch (error) {
    if (error.code !== "ENOTFOUND") throw error;
    const [ipv6] = await dns.promises.resolve6(hostname).catch(() => []);
    if (!ipv6) throw error;
    log(`  (resolved ${hostname} via IPv6 — macOS getaddrinfo workaround)`);
    config.host = ipv6;
    config.ssl = { rejectUnauthorized: false, servername: hostname };
  }

  return config;
}

let client;

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(msg);
  process.exitCode = 1;
};

async function main() {
  client = new pg.Client(await buildClientConfig(connectionString));
  await client.connect();
  log("▶ Connected to Postgres.");

  await client.query(`
    create table if not exists _beams_migration (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query("select filename from _beams_migration")).rows.map(
      (r) => r.filename,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (STATUS_ONLY) {
    log(`\n  ${"STATUS".padEnd(9)} MIGRATION`);
    for (const f of files) {
      log(`  ${(applied.has(f) ? "applied" : "pending").padEnd(9)} ${f}`);
    }
    log(`\n  ${applied.size}/${files.length} applied.`);
    return;
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    log("✓ All migrations already applied.");
  } else {
    log(`▶ Applying ${pending.length} migration(s)…\n`);
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  → ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into _beams_migration (filename) values ($1)",
        [file],
      );
      await client.query("commit");
      console.log("✓");
    } catch (error) {
      await client.query("rollback");
      console.log("✗");
      fail(
        `\n❌ Migration failed: ${file}\n` +
          `   ${error.message}\n` +
          (error.hint ? `   hint: ${error.hint}\n` : "") +
          (error.position ? `   position: ${error.position}\n` : "") +
          `\n   Nothing from this file was applied (rolled back). Fix the SQL in\n` +
          `   supabase/migrations/${file} and re-run — earlier files stay applied.\n`,
      );
      return;
    }
  }

  if (RUN_SEED) {
    if (!existsSync(SEED_FILE)) {
      fail("❌ supabase/seed.sql not found.");
      return;
    }
    process.stdout.write("  → seed.sql … ");
    try {
      await client.query("begin");
      await client.query(readFileSync(SEED_FILE, "utf8"));
      await client.query("commit");
      console.log("✓");
    } catch (error) {
      await client.query("rollback");
      console.log("✗");
      fail(`\n❌ Seed failed:\n   ${error.message}\n`);
      return;
    }
  }

  // Sanity report — proves the schema really is there.
  const { rows } = await client.query(`
    select
      (select count(*) from information_schema.tables
        where table_schema='public' and table_type='BASE TABLE')      as tables,
      (select count(*) from pg_tables
        where schemaname='public' and rowsecurity)                    as rls_enabled,
      (select count(*) from pg_policies where schemaname='public')    as policies,
      (select count(*) from pg_indexes where schemaname='public')     as indexes,
      (select count(*) from role)                                     as roles,
      (select count(*) from permission)                               as permissions,
      (select count(*) from role_permission)                          as grants,
      (select count(*) from assembly)                                 as assemblies;
  `);

  const s = rows[0];
  log("\n  ── Schema verification ─────────────────────────");
  log(`   tables .............. ${s.tables}`);
  log(`   RLS-enabled tables .. ${s.rls_enabled}`);
  log(`   RLS policies ........ ${s.policies}`);
  log(`   indexes ............. ${s.indexes}`);
  log(`   roles seeded ........ ${s.roles}`);
  log(`   permissions seeded .. ${s.permissions}`);
  log(`   role grants ......... ${s.grants}`);
  log(`   assemblies .......... ${s.assemblies}`);
  log("  ────────────────────────────────────────────────");
  log("\n🎉 Database is live and verified.");
}

main()
  .catch((error) => {
    fail(`❌ ${error.message}`);
  })
  .finally(async () => {
    await client?.end().catch(() => {});
  });
