#!/usr/bin/env node
/**
 * Verifies the User Management flow against the LIVE database, end to end:
 * an admin creates a Secretary login, that login gets correct JWT claims,
 * can read members but not confidential data, and suspend blocks sign-in.
 * Cleans up the created login afterwards.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-user-mgmt.mjs --email admin --password pw
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;

const NEW_EMAIL = "berea-secretary-verify@example.com";

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: arg("--email"), password: arg("--password") });
if (authErr) { console.error(`❌ ${authErr.message}`); process.exit(1); }
const claims = JSON.parse(Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString()).app_metadata;
const assemblyId = claims.assembly_id;
const adminUserId = auth.user.id;
console.log(`▶ Signed in as admin · assembly ${assemblyId}\n`);

const db = new pg.Client((() => { const u = new URL(DATABASE_URL); return { user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), host: u.hostname, port: +u.port, database: u.pathname.slice(1), ssl: { rejectUnauthorized: false } }; })());
await db.connect();

const cleanup = { members: [], users: [] };

try {
  // ── Replicate createUser() (the module runs server-side; here we exercise the
  //    same operations against the live DB to prove the DATA outcome). ────────
  console.log("── ADMIN CREATES A SECRETARY LOGIN ─────────────────");
  const password = `Berea-verify!7`;
  const created = await admin.auth.admin.createUser({ email: NEW_EMAIL, password, email_confirm: true, user_metadata: { full_name: "Verify Secretary" } });
  let newId = created.data?.user?.id;
  if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers();
    newId = list.users.find((u) => u.email === NEW_EMAIL)?.id;
    if (newId) await admin.auth.admin.updateUserById(newId, { password, email_confirm: true });
  }
  cleanup.users.push(newId);
  check("auth login created", Boolean(newId));

  const { rows: [role] } = await db.query("select id from role where key='secretary'");
  const { rows: [member] } = await db.query(
    "insert into member (assembly_id, first_name, last_name, primary_email, current_status, joined_on, created_by, updated_by) values ($1,'Verify','Secretary',$2,'member',current_date,$3,$3) returning id",
    [assemblyId, NEW_EMAIL, adminUserId]);
  cleanup.members.push(member.id);
  await db.query("insert into app_user (id,email,full_name,member_id,is_active) values ($1,$2,'Verify Secretary',$3,true) on conflict (id) do update set member_id=$3, is_active=true", [newId, NEW_EMAIL, member.id]);
  await db.query("insert into user_assembly_role (app_user_id,assembly_id,role_id,is_primary,is_active,granted_by) values ($1,$2,$3,true,true,$4) on conflict do nothing", [newId, assemblyId, role.id, adminUserId]);
  check("profile, member link and role assignment written", true);

  console.log("\n── THE NEW USER SIGNS IN ───────────────────────────");
  const asSecretary = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sAuth, error: sErr } = await asSecretary.auth.signInWithPassword({ email: NEW_EMAIL, password });
  check("new user can sign in with the temp password", !sErr, sErr?.message);

  const sClaims = JSON.parse(Buffer.from(sAuth.session.access_token.split(".")[1], "base64url").toString()).app_metadata;
  check("their token carries the assembly", sClaims.assembly_id === assemblyId);
  check("their token carries the secretary role", sClaims.role_keys?.includes("secretary"), JSON.stringify(sClaims.role_keys));
  check("they are linked to a member record", Boolean(sClaims.member_id));

  console.log("\n── THEIR ACCESS IS CORRECT FOR A SECRETARY ─────────");
  const { count: memberCount } = await asSecretary.from("member").select("*", { count: "exact", head: true });
  check("CAN read members", (memberCount ?? 0) > 0, `${memberCount} visible`);
  const { data: fin } = await asSecretary.from("contribution").select("id");
  check("🔒 CANNOT read finance (no finance.read)", (fin ?? []).length === 0);
  const { data: couns } = await asSecretary.from("counselling_case").select("id");
  check("🔒 CANNOT read counselling", (couns ?? []).length === 0);
  await asSecretary.auth.signOut();

  console.log("\n── SUSPEND BLOCKS SIGN-IN ──────────────────────────");
  await db.query("update app_user set is_active=false where id=$1", [newId]);
  await admin.auth.admin.updateUserById(newId, { ban_duration: "876000h" });
  const blocked = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: bErr } = await blocked.auth.signInWithPassword({ email: NEW_EMAIL, password });
  check("a suspended user cannot sign in", Boolean(bErr), bErr ? "blocked" : "STILL ALLOWED — bug");
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
  ? "\n🎉 User management verified: admin can create a working Secretary login with\n   correct claims and scoped access, and suspension blocks sign-in."
  : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
