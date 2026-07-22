#!/usr/bin/env node
/**
 * Prints exactly what is currently in the database — the reference/seed data
 * and record counts. Read-only. Useful for verifying what a seed actually did.
 *
 * Usage: node --env-file=.env.local scripts/db-inspect.mjs
 */
import pg from "pg";

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

const section = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 56 - label.length))}`);
  if (rows.length === 0) console.log("   (empty)");
  else console.table(rows);
};

await client.connect();

await section(
  "ORG HIERARCHY",
  `select r.name as region, a.name as area, d.name as district,
          asm.name as assembly, asm.slug, asm.city, asm.currency, asm.timezone
   from assembly asm
   join district d on d.id = asm.district_id
   join area a     on a.id = d.area_id
   join region r   on r.id = a.region_id`,
);

await section("MINISTRIES", `select name, code, category from ministry order by code`);
await section("SERVICE TYPES", `select name, cadence, default_day from service_type order by name`);
await section("FUNDS", `select name, code, is_restricted from fund order by code`);
await section(
  "LEADERSHIP POSITIONS",
  `select name, category, rank from leadership_position order by rank, name`,
);
await section(
  "ACTUAL CHURCH DATA (people & groups)",
  `select (select count(*) from member)     as members,
          (select count(*) from app_user)   as app_users,
          (select count(*) from family)     as families,
          (select count(*) from home_cell)  as home_cells,
          (select count(*) from visitor)    as visitors,
          (select count(*) from contribution) as contributions`,
);

await client.end();
