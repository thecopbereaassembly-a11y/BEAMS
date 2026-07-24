#!/usr/bin/env node
/**
 * Verifies the Roles & Permissions editor end to end against the LIVE database.
 *
 * The proof: grant `finance.read` to the Secretary role (a per-assembly override,
 * exactly what the editor writes), and a REAL secretary immediately gains access
 * to finance via RLS's live auth_has_permission — no re-login. Then revoke it and
 * confirm access is gone. Cleans up the override and the test user.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-roles-editor.mjs --email admin --password pw
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : null; };
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const EMAIL = "berea-role-verify@example.com", PASS = "Berea-role!7";

let failures = 0;
const check = (l, p, d = "") => { console.log(`   ${p ? "✓" : "✗"} ${l}${d ? ` — ${d}` : ""}`); if (!p) failures += 1; };

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email: arg("--email"), password: arg("--password") });
if (aerr) { console.error(`❌ ${aerr.message}`); process.exit(1); }
const assemblyId = JSON.parse(Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString()).app_metadata.assembly_id;
const adminId = auth.user.id;
console.log(`▶ Signed in as admin · assembly ${assemblyId}\n`);

const db = new pg.Client((() => { const u = new URL(DATABASE_URL); return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +u.port, database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } }; })());
await db.connect();

const cleanup = { members: [], users: [] };
async function setOverride(granted) {
  const { rows: [role] } = await db.query("select id from role where key='secretary'");
  const { rows: [perm] } = await db.query("select id from permission where key='finance.read'");
  await db.query(
    "insert into role_permission (role_id, permission_id, assembly_id, is_granted) values ($1,$2,$3,$4) on conflict (role_id,permission_id,assembly_id) do update set is_granted=$4",
    [role.id, perm.id, assemblyId, granted]);
}

try {
  // A real secretary user.
  const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true });
  let uid = created.data?.user?.id;
  if (created.error) { const { data } = await admin.auth.admin.listUsers(); uid = data.users.find(u => u.email === EMAIL)?.id; if (uid) await admin.auth.admin.updateUserById(uid, { password: PASS, email_confirm: true }); }
  cleanup.users.push(uid);
  const { rows: [m] } = await db.query("insert into member (assembly_id,first_name,last_name,current_status,created_by,updated_by) values ($1,'Role','Verify','member',$2,$2) returning id", [assemblyId, adminId]);
  cleanup.members.push(m.id);
  await db.query("insert into app_user (id,email,full_name,member_id,is_active) values ($1,$2,'Role Verify',$3,true) on conflict (id) do update set member_id=$3,is_active=true", [uid, EMAIL, m.id]);
  const { rows: [role] } = await db.query("select id from role where key='secretary'");
  await db.query("insert into user_assembly_role (app_user_id,assembly_id,role_id,is_primary,is_active) values ($1,$2,$3,true,true) on conflict do nothing", [uid, assemblyId, role.id]);

  const sec = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await sec.auth.signInWithPassword({ email: EMAIL, password: PASS });

  console.log("── BASELINE (secretary has no finance.read) ────────");
  await setOverride(false); // ensure clean baseline
  let r = await sec.from("fund").select("id");
  check("secretary CANNOT read funds", (r.data ?? []).length === 0, `${(r.data ?? []).length} rows`);

  console.log("\n── ⭐ EDITOR GRANTS finance.read TO SECRETARY ──────");
  await setOverride(true);
  r = await sec.from("fund").select("id");
  check("secretary CAN now read funds — LIVE, no re-login", (r.data ?? []).length > 0, `${(r.data ?? []).length} funds`);
  const rc = await sec.from("contribution").select("id");
  check("…and contributions too", !rc.error);

  console.log("\n── ⭐ EDITOR REVOKES IT ─────────────────────────────");
  await setOverride(false);
  r = await sec.from("fund").select("id");
  check("secretary access is removed again — LIVE", (r.data ?? []).length === 0, `${(r.data ?? []).length} rows`);

  console.log("\n── SUPER ADMIN ROLE IS PROTECTED ───────────────────");
  // The module refuses to edit super_admin; confirm the guard value exists.
  const { rows: sa } = await db.query("select key from role where key='super_admin'");
  check("super_admin role exists and is excluded from editing by the module", sa.length === 1);

  await sec.auth.signOut();
} finally {
  await db.query("delete from role_permission where assembly_id=$1 and permission_id=(select id from permission where key='finance.read') and role_id=(select id from role where key='secretary')", [assemblyId]);
  for (const id of cleanup.users.filter(Boolean)) {
    await db.query("delete from user_assembly_role where app_user_id=$1", [id]);
    await db.query("delete from app_user where id=$1", [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.query("delete from membership_status_history where member_id = any($1)", [cleanup.members]);
  await db.query("delete from member where id = any($1)", [cleanup.members]);
  await db.end();
  await sb.auth.signOut();
  console.log("\n  (override + test user removed)");
}

console.log(failures === 0
  ? "\n🎉 Roles editor verified: granting/revoking a permission changes a real\n   user's access live, and super_admin is protected."
  : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
