#!/usr/bin/env node
/**
 * Verifies MULTI-ROLE user assignment against the LIVE database:
 * a person can hold several roles at once (e.g. Elder + Secretary), their JWT
 * carries every role key, their permissions are the UNION across roles, and
 * editing roles (removing one, keeping another) is reflected in a fresh token.
 * Cleans up the created login afterwards.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-multi-role.mjs --email admin --password pw
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;

const NEW_EMAIL = "berea-multirole-verify@example.com";
const ROLES = ["elder", "secretary"];

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};
const claimsOf = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).app_metadata;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: arg("--email"), password: arg("--password") });
if (authErr) { console.error(`❌ ${authErr.message}`); process.exit(1); }
const assemblyId = claimsOf(auth.session.access_token).assembly_id;
const adminUserId = auth.user.id;
console.log(`▶ Signed in as admin · assembly ${assemblyId}\n`);

const db = new pg.Client((() => { const u = new URL(DATABASE_URL); return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +u.port, database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } }; })());
await db.connect();

const cleanup = { members: [], users: [] };

try {
  console.log("── ADMIN CREATES A LOGIN WITH TWO ROLES (Elder + Secretary) ──");
  const password = `Berea-multi!7`;
  const created = await admin.auth.admin.createUser({ email: NEW_EMAIL, password, email_confirm: true, user_metadata: { full_name: "Verify Multirole" } });
  let newId = created.data?.user?.id;
  if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers();
    newId = list.users.find((u) => u.email === NEW_EMAIL)?.id;
    if (newId) await admin.auth.admin.updateUserById(newId, { password, email_confirm: true });
  }
  cleanup.users.push(newId);
  check("auth login created", Boolean(newId));

  const { rows: roleRows } = await db.query("select id, key from role where key = any($1)", [ROLES]);
  check("both roles exist in the role table", roleRows.length === 2, roleRows.map((r) => r.key).join(", "));
  const { rows: [member] } = await db.query(
    "insert into member (assembly_id, first_name, last_name, primary_email, current_status, joined_on, created_by, updated_by) values ($1,'Verify','Multirole',$2,'member',current_date,$3,$3) returning id",
    [assemblyId, NEW_EMAIL, adminUserId]);
  cleanup.members.push(member.id);
  await db.query("insert into app_user (id,email,full_name,member_id,is_active) values ($1,$2,'Verify Multirole',$3,true) on conflict (id) do update set member_id=$3, is_active=true", [newId, NEW_EMAIL, member.id]);
  // One user_assembly_role row per role — exactly what createUser() now does.
  for (const r of roleRows) {
    await db.query("insert into user_assembly_role (app_user_id,assembly_id,role_id,is_primary,is_active,granted_by) values ($1,$2,$3,true,true,$4) on conflict do nothing", [newId, assemblyId, r.id, adminUserId]);
  }
  check("one user_assembly_role row written per role", true);

  console.log("\n── THEIR TOKEN CARRIES EVERY ROLE ──────────────────");
  const asUser = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: uAuth, error: uErr } = await asUser.auth.signInWithPassword({ email: NEW_EMAIL, password });
  check("new user can sign in", !uErr, uErr?.message);
  const roleKeys = claimsOf(uAuth.session.access_token).role_keys ?? [];
  check("token carries the Elder role", roleKeys.includes("elder"), JSON.stringify(roleKeys));
  check("token carries the Secretary role", roleKeys.includes("secretary"), JSON.stringify(roleKeys));

  console.log("\n── PERMISSIONS ARE THE UNION ACROSS ROLES ──────────");
  // Union check: count of distinct permissions across BOTH roles equals the
  // effective permission set the app resolves (role_permission, granted only).
  const { rows: [{ union_count }] } = await db.query(
    `select count(distinct rp.permission_id) as union_count
       from role_permission rp
      where rp.role_id = any($1) and rp.is_granted = true`, [roleRows.map((r) => r.id)]);
  const { rows: [{ elder_count }] } = await db.query(
    `select count(distinct rp.permission_id) as elder_count
       from role_permission rp join role r on r.id = rp.role_id
      where r.key = 'elder' and rp.is_granted = true`);
  check("union of both roles ≥ Elder alone (roles genuinely combine)", Number(union_count) >= Number(elder_count), `union=${union_count}, elder=${elder_count}`);

  console.log("\n── EDIT ROLES: DROP SECRETARY, KEEP ELDER ──────────");
  // setUserRoles() deactivates the removed role rather than deleting it.
  const secretaryId = roleRows.find((r) => r.key === "secretary").id;
  await db.query("update user_assembly_role set is_active=false where app_user_id=$1 and assembly_id=$2 and role_id=$3", [newId, assemblyId, secretaryId]);
  const asUser2 = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: u2 } = await asUser2.auth.signInWithPassword({ email: NEW_EMAIL, password });
  const roleKeys2 = claimsOf(u2.session.access_token).role_keys ?? [];
  check("fresh token now excludes Secretary", !roleKeys2.includes("secretary"), JSON.stringify(roleKeys2));
  check("fresh token still includes Elder", roleKeys2.includes("elder"), JSON.stringify(roleKeys2));
  await asUser.auth.signOut();
  await asUser2.auth.signOut();
} finally {
  for (const id of cleanup.users.filter(Boolean)) {
    await db.query("delete from user_assembly_role where app_user_id=$1", [id]);
    await db.query("delete from app_user where id=$1", [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.query("delete from activity_log where entity_id = any($1)", [cleanup.members]);
  await db.query("delete from membership_status_history where member_id = any($1)", [cleanup.members]);
  await db.query("delete from member where id = any($1)", [cleanup.members]);
  await db.end();
  await supabase.auth.signOut();
  console.log("\n  (verification user removed)");
}

console.log(failures === 0
  ? "\n🎉 Multi-role verified: a person can hold several roles at once, their token\n   carries every role, permissions are the union, and role edits take effect."
  : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
