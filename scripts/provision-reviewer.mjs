#!/usr/bin/env node
/**
 * Provisions an external, read-only REVIEWER account for someone evaluating the
 * system and making recommendations.
 *
 * It first ensures a "reviewer" role exists whose grants are the Auditor's
 * read-everything set MINUS the pastorally sensitive modules (counselling and
 * welfare). Because the permission resolver is additive (there is no "deny"),
 * fewer permissions must come from a role that simply omits them — not from an
 * override. Then, given --email, it creates the login and assigns that role.
 *
 * The reviewer is NOT added to the member roster (member_id stays null), so
 * they don't pollute membership counts.
 *
 * Usage:
 *   # role only (safe to run anytime; idempotent):
 *   node --env-file=.env.local scripts/provision-reviewer.mjs
 *   # role + account (temp password generated unless --password given):
 *   node --env-file=.env.local scripts/provision-reviewer.mjs \
 *     --email reviewer@example.com --name "Jane Reviewer"
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import pg from "pg";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const email = arg("--email");
const fullName = arg("--name", "External Reviewer");
const assemblySlug = arg("--assembly", "berea-english");
const password = arg("--password", `Berea-${crypto.randomUUID().slice(0, 8)}!7`);

// The two modules the tightened reviewer must NOT see.
const EXCLUDE = ["counselling.read", "welfare.read"];

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error("❌ Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local");
  process.exit(1);
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const u = new URL(DATABASE_URL);
const db = new pg.Client({
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  host: u.hostname,
  port: Number(u.port) || 5432,
  database: u.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});
await db.connect();

try {
  await db.query("begin");

  // ── 1. Ensure the reviewer role ───────────────────────────────────────────
  const { rows: [role] } = await db.query(
    `insert into role (key, name, description, rank, is_system, is_assignable)
     values ('reviewer', 'Read-only Reviewer (external)',
             'Read access across the system except counselling and welfare. For external reviewers.',
             101, true, true)
     on conflict (key) do update set name = excluded.name, description = excluded.description
     returning id`,
  );

  // ── 2. Grants = Auditor's granted globals, minus the sensitive modules ─────
  const { rows: auditorGrants } = await db.query(
    `select p.key
       from role_permission rp
       join role r on r.id = rp.role_id
       join permission p on p.id = rp.permission_id
      where r.key = 'auditor' and rp.assembly_id is null and rp.is_granted = true`,
  );
  const grantKeys = auditorGrants.map((g) => g.key).filter((k) => !EXCLUDE.includes(k));

  // Rewrite reviewer's global grants cleanly (idempotent).
  await db.query("delete from role_permission where role_id = $1 and assembly_id is null", [role.id]);
  await db.query(
    `insert into role_permission (role_id, permission_id, assembly_id, is_granted)
     select $1, p.id, null, true from permission p where p.key = any($2)`,
    [role.id, grantKeys],
  );
  console.log(`▶ reviewer role ready — ${grantKeys.length} read permissions (excluded: ${EXCLUDE.join(", ")})`);

  // ── 3. Account (only if --email given) ────────────────────────────────────
  if (email) {
    const { rows: [assembly] } = await db.query("select id, name from assembly where slug = $1", [assemblySlug]);
    if (!assembly) throw new Error(`Assembly "${assemblySlug}" not found — run the seed.`);

    // auth user (create or reset)
    let userId;
    const created = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (created.error) {
      if (!/already/i.test(created.error.message)) throw created.error;
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())?.id;
      if (!userId) throw new Error("User exists but could not be located.");
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      userId = created.data.user.id;
    }

    // profile — deliberately NO member link (external reviewer).
    await db.query(
      `insert into app_user (id, email, full_name, is_super_admin, is_active)
       values ($1, $2, $3, false, true)
       on conflict (id) do update
         set email = excluded.email, full_name = excluded.full_name,
             is_super_admin = false, is_active = true, updated_at = now()`,
      [userId, email, fullName],
    );

    await db.query(
      `insert into user_assembly_role (app_user_id, assembly_id, role_id, is_primary, is_active, granted_by)
       values ($1, $2, $3, true, true, $1)
       on conflict (app_user_id, assembly_id, role_id) do update
         set is_primary = true, is_active = true, deleted_at = null`,
      [userId, assembly.id, role.id],
    );

    await db.query("commit");
    console.log(`  ✓ reviewer account ready in ${assembly.name}\n`);
    console.log("  ─────────────────────────────────────────────");
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log("  ─────────────────────────────────────────────");
    console.log("  Share these once; ask them to change the password after signing in.");
  } else {
    await db.query("commit");
    console.log("  (no --email given — role provisioned, no account created)");
  }
} catch (error) {
  await db.query("rollback");
  console.error(`\n❌ ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
