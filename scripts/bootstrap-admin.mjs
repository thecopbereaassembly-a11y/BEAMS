#!/usr/bin/env node
/**
 * Creates the first administrator: an auth user + app_user profile + linked
 * member record + role assignment in Berea English Assembly.
 *
 * Usage:
 *   node --env-file=.env.local scripts/bootstrap-admin.mjs \
 *     --email you@example.com --password 'StrongPass123' --name "Your Name" \
 *     [--role presiding_elder] [--super]
 *
 * Idempotent: re-running updates the existing user rather than duplicating.
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (flag) => process.argv.includes(flag);

const email = arg("--email");
const password = arg("--password");
const fullName = arg("--name", "Administrator");
const roleKey = arg("--role", "presiding_elder");
const isSuper = has("--super");
const assemblySlug = arg("--assembly", "berea-english");

if (!email || !password) {
  console.error(
    "❌ Missing required args.\n" +
      "   node --env-file=.env.local scripts/bootstrap-admin.mjs \\\n" +
      "     --email you@example.com --password 'StrongPass123' --name \"Your Name\"",
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌ Password must be at least 8 characters.");
  process.exit(1);
}

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } =
  process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error(
    "❌ Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local",
  );
  process.exit(1);
}

// ── 1. Create (or find) the auth user ───────────────────────────────────────
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`▶ Creating auth user ${email} …`);
let userId;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});

if (created.error) {
  if (/already/i.test(created.error.message)) {
    console.log("  user already exists — locating and resetting password…");
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const found = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!found) throw new Error("User exists but could not be located.");
    userId = found.id;
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) throw updErr;
  } else {
    throw created.error;
  }
} else {
  userId = created.data.user.id;
}
console.log(`  ✓ auth user id: ${userId}`);

// ── 2. Profile, member record, role assignment ──────────────────────────────
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

  const {
    rows: [assembly],
  } = await db.query("select id, name from assembly where slug = $1", [
    assemblySlug,
  ]);
  if (!assembly) throw new Error(`Assembly "${assemblySlug}" not found — run the seed.`);

  const {
    rows: [role],
  } = await db.query("select id, name from role where key = $1", [roleKey]);
  if (!role) throw new Error(`Role "${roleKey}" not found — run the RBAC seed.`);

  // app_user profile
  await db.query(
    `insert into app_user (id, email, full_name, is_super_admin, is_active)
     values ($1, $2, $3, $4, true)
     on conflict (id) do update
       set email = excluded.email,
           full_name = excluded.full_name,
           is_super_admin = excluded.is_super_admin,
           is_active = true,
           updated_at = now()`,
    [userId, email, fullName, isSuper],
  );

  // linked member record
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.length ? rest.join(" ") : firstName;

  const {
    rows: [existingMember],
  } = await db.query("select member_id from app_user where id = $1", [userId]);

  let memberId = existingMember?.member_id ?? null;
  if (!memberId) {
    const {
      rows: [member],
    } = await db.query(
      `insert into member (assembly_id, first_name, last_name, primary_email,
                           current_status, joined_on, created_by)
       values ($1, $2, $3, $4, 'member', current_date, $5)
       returning id`,
      [assembly.id, firstName, lastName, email, userId],
    );
    memberId = member.id;
    await db.query("update app_user set member_id = $1 where id = $2", [
      memberId,
      userId,
    ]);
  }

  // role assignment in this assembly (primary)
  await db.query(
    `insert into user_assembly_role
       (app_user_id, assembly_id, role_id, is_primary, is_active, granted_by)
     values ($1, $2, $3, true, true, $1)
     on conflict (app_user_id, assembly_id, role_id) do update
       set is_primary = true, is_active = true, deleted_at = null`,
    [userId, assembly.id, role.id],
  );

  await db.query("commit");

  console.log(`  ✓ profile + member record linked (member id: ${memberId})`);
  console.log(`  ✓ role "${role.name}" granted in ${assembly.name}`);
  if (isSuper) console.log("  ✓ super administrator flag set");
  console.log(`\n🎉 You can now sign in at /login as ${email}`);
} catch (error) {
  await db.query("rollback");
  console.error(`\n❌ ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
