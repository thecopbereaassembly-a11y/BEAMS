#!/usr/bin/env node
/**
 * Detects the correct Supabase **session pooler** host (IPv4) for this project.
 *
 * Why: Supabase's direct host (db.<ref>.supabase.co) is IPv6-only. On networks
 * with partial/absent IPv6 it is unreachable, so we must use the regional
 * pooler — but the region is baked into the hostname. This probes the known
 * regions in parallel and reports which one accepts the project's credentials.
 *
 * Usage: node --env-file=.env.local scripts/find-pooler.mjs
 * Prints only hostnames and statuses — never the password.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL not set in .env.local");
  process.exit(1);
}

const parsed = new URL(url);
const password = decodeURIComponent(parsed.password);
// db.<ref>.supabase.co  →  <ref>
const ref = parsed.hostname.split(".")[1];

const REGIONS = [
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2",
  "eu-north-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "sa-east-1", "ap-south-1", "ap-southeast-1",
  "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
];
const PREFIXES = ["aws-0", "aws-1"];

const candidates = PREFIXES.flatMap((p) =>
  REGIONS.map((r) => `${p}-${r}.pooler.supabase.com`),
);

console.log(`▶ Probing ${candidates.length} pooler hosts for project ${ref}…\n`);

async function probe(host) {
  const client = new pg.Client({
    user: `postgres.${ref}`,
    password,
    host,
    port: 5432,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return { host, ok: true };
  } catch (error) {
    return { host, ok: false, reason: error.message.split("\n")[0] };
  } finally {
    await client.end().catch(() => {});
  }
}

const results = await Promise.all(candidates.map(probe));
const winner = results.find((r) => r.ok);

if (winner) {
  console.log(`✅ FOUND: ${winner.host}\n`);
  console.log("   Set this in .env.local (keep your %40-encoded password):\n");
  console.log(
    `   DATABASE_URL=postgresql://postgres.${ref}:<PASSWORD>@${winner.host}:5432/postgres\n`,
  );
} else {
  console.log("❌ No pooler host accepted the credentials. Sample errors:\n");
  for (const r of results.slice(0, 5)) console.log(`   ${r.host} → ${r.reason}`);
  console.log(
    "\n   Next step: in Supabase click **Connect → Session pooler** and copy the URI.",
  );
}
