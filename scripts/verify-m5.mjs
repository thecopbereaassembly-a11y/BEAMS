#!/usr/bin/env node
/**
 * M5 verification — and the first real test of ADR-010.
 *
 * Creates a SECOND user with the `secretary` role (which by design holds NO
 * counselling.read or welfare.read), then proves from that user's own session
 * that the confidential records are invisible and unwritable — while the data
 * demonstrably exists for an authorised user.
 *
 * Uses placeholder emails only. Cleans up both users and all fixtures.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m5.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } =
  process.env;

const RESTRICTED_EMAIL = "m5-verify-secretary@example.com";
const RESTRICTED_PASSWORD = "VerifyOnly!2026x";

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: arg("--email"),
  password: arg("--password"),
});
if (authErr) {
  console.error(`❌ ${authErr.message}`);
  process.exit(1);
}
const assemblyId = JSON.parse(
  Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString(),
).app_metadata.assembly_id;
const userId = auth.user.id;
console.log(`▶ Signed in as authorised user · assembly ${assemblyId}\n`);

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

const cleanup = { members: [], visitors: [], followups: [], prayer: [], counselling: [], welfare: [], users: [] };

try {
  // ── Fixtures ─────────────────────────────────────────────────────────────
  const { data: member } = await supabase
    .from("member")
    .insert({
      assembly_id: assemblyId,
      first_name: "M5",
      last_name: "Fixture",
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  cleanup.members.push(member.id);

  console.log("── VISITORS ───────────────────────────────────────");
  const { data: visitor, error: visErr } = await supabase
    .from("visitor")
    .insert({
      assembly_id: assemblyId,
      first_name: "M5",
      last_name: "Visitor",
      first_visit_on: new Date().toISOString().slice(0, 10),
      visit_count: 1,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("visitor recorded", !visErr && Boolean(visitor?.id), visErr?.message);
  cleanup.visitors.push(visitor.id);

  await supabase.from("visitor_visit").insert({
    assembly_id: assemblyId,
    visitor_id: visitor.id,
    visited_on: new Date().toISOString().slice(0, 10),
    created_by: userId,
  });
  const { count: visitCount } = await supabase
    .from("visitor_visit")
    .select("*", { count: "exact", head: true })
    .eq("visitor_id", visitor.id);
  check("visit logged", visitCount === 1);

  console.log("\n── SHEPHERDING ────────────────────────────────────");
  const { data: followup, error: fuErr } = await supabase
    .from("followup")
    .insert({
      assembly_id: assemblyId,
      subject_member_id: member.id,
      reason: "absent_4_weeks",
      priority: "normal",
      status: "open",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("follow-up raised", !fuErr && Boolean(followup?.id), fuErr?.message);
  cleanup.followups.push(followup.id);

  await supabase.from("shepherd_assignment").insert({
    assembly_id: assemblyId,
    followup_id: followup.id,
    shepherd_member_id: member.id,
    is_active: true,
    created_by: userId,
  });
  await supabase.from("followup_activity").insert({
    assembly_id: assemblyId,
    followup_id: followup.id,
    activity_type: "call",
    notes: "Verification call",
    created_by: userId,
  });
  const { count: activityCount } = await supabase
    .from("followup_activity")
    .select("*", { count: "exact", head: true })
    .eq("followup_id", followup.id);
  check("contact logged against follow-up", activityCount === 1);

  // The sweep's guard: a member with an OPEN follow-up for the same reason
  // must not receive a second one.
  const { data: openForReason } = await supabase
    .from("followup")
    .select("subject_member_id")
    .eq("assembly_id", assemblyId)
    .eq("reason", "absent_4_weeks")
    .in("status", ["open", "in_progress"]);
  check(
    "absentee sweep would skip this member (no duplicates)",
    (openForReason ?? []).some((f) => f.subject_member_id === member.id),
  );

  console.log("\n── PRAYER ─────────────────────────────────────────");
  const { data: prayer, error: prayErr } = await supabase
    .from("prayer_request")
    .insert({
      assembly_id: assemblyId,
      member_id: member.id,
      body: "Verification prayer request",
      privacy: "leaders_only",
      status: "open",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("prayer request created", !prayErr && Boolean(prayer?.id), prayErr?.message);
  cleanup.prayer.push(prayer.id);

  console.log("\n── CONFIDENTIAL FIXTURES (as authorised user) ─────");
  const { data: cCase, error: cErr } = await supabase
    .from("counselling_case")
    .insert({
      assembly_id: assemblyId,
      member_id: member.id,
      title: "Verification counselling",
      status: "open",
      opened_on: new Date().toISOString().slice(0, 10),
      is_confidential: true,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("counselling case created by authorised user", !cErr && Boolean(cCase?.id), cErr?.message);
  cleanup.counselling.push(cCase.id);

  const { data: wCase, error: wErr } = await supabase
    .from("welfare_case")
    .insert({
      assembly_id: assemblyId,
      member_id: member.id,
      title: "Verification welfare",
      amount_requested: 500,
      currency: "GHS",
      status: "open",
      requested_on: new Date().toISOString().slice(0, 10),
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("welfare case created by authorised user", !wErr && Boolean(wCase?.id), wErr?.message);
  cleanup.welfare.push(wCase.id);

  // ── Create the RESTRICTED user (secretary role) ──────────────────────────
  console.log("\n── ⭐ CONFIDENTIAL ACCESS CONTROL (ADR-010) ────────");
  const created = await admin.auth.admin.createUser({
    email: RESTRICTED_EMAIL,
    password: RESTRICTED_PASSWORD,
    email_confirm: true,
  });
  let restrictedId = created.data?.user?.id;
  if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers();
    restrictedId = list.users.find((x) => x.email === RESTRICTED_EMAIL)?.id;
    if (restrictedId) await admin.auth.admin.updateUserById(restrictedId, { password: RESTRICTED_PASSWORD });
  }
  cleanup.users.push(restrictedId);

  await db.query(
    `insert into app_user (id, email, full_name, is_super_admin, is_active)
     values ($1, $2, 'M5 Verification Secretary', false, true)
     on conflict (id) do update set is_super_admin = false, is_active = true`,
    [restrictedId, RESTRICTED_EMAIL],
  );
  const { rows: [secretaryRole] } = await db.query("select id from role where key = 'secretary'");
  await db.query(
    `insert into user_assembly_role (app_user_id, assembly_id, role_id, is_primary, is_active)
     values ($1, $2, $3, true, true)
     on conflict (app_user_id, assembly_id, role_id) do update set is_active = true`,
    [restrictedId, assemblyId, secretaryRole.id],
  );

  const restricted = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: rAuth, error: rErr } = await restricted.auth.signInWithPassword({
    email: RESTRICTED_EMAIL,
    password: RESTRICTED_PASSWORD,
  });
  check("restricted user can sign in", !rErr, rErr?.message);

  const rClaims = JSON.parse(
    Buffer.from(rAuth.session.access_token.split(".")[1], "base64url").toString(),
  ).app_metadata;
  check("restricted user has the secretary role", rClaims.role_keys?.includes("secretary"), JSON.stringify(rClaims.role_keys));
  check("restricted user is NOT a super admin", rClaims.is_super_admin === false);

  // What they SHOULD see.
  const { count: memberCount, error: mErr } = await restricted
    .from("member")
    .select("*", { count: "exact", head: true });
  check("secretary CAN read members (has member.read)", !mErr && (memberCount ?? 0) > 0, `${memberCount} visible`);

  // What they MUST NOT see.
  const { data: cRows, error: cReadErr } = await restricted.from("counselling_case").select("id");
  check(
    "🔒 secretary CANNOT read counselling cases",
    (cRows ?? []).length === 0,
    cReadErr ? `blocked: ${cReadErr.code}` : `${(cRows ?? []).length} rows returned`,
  );

  const { data: wRows } = await restricted.from("welfare_case").select("id");
  check("🔒 secretary CANNOT read welfare cases", (wRows ?? []).length === 0, `${(wRows ?? []).length} rows`);

  const { data: sRows } = await restricted.from("counselling_session").select("id");
  check("🔒 secretary CANNOT read counselling sessions", (sRows ?? []).length === 0);

  // And must not be able to write either.
  const { error: writeErr } = await restricted.from("counselling_case").insert({
    assembly_id: assemblyId,
    member_id: member.id,
    title: "Should be rejected",
    status: "open",
    opened_on: new Date().toISOString().slice(0, 10),
  });
  check("🔒 secretary CANNOT create a counselling case", Boolean(writeErr), writeErr?.code ?? "NO ERROR — RLS FAILED");

  const { error: wWriteErr } = await restricted.from("welfare_case").insert({
    assembly_id: assemblyId,
    member_id: member.id,
    title: "Should be rejected",
    status: "open",
    requested_on: new Date().toISOString().slice(0, 10),
  });
  check("🔒 secretary CANNOT create a welfare case", Boolean(wWriteErr), wWriteErr?.code ?? "NO ERROR — RLS FAILED");

  // Prove the data really is there for someone authorised — so the zeros above
  // mean "blocked", not "empty table".
  const { data: adminSees } = await supabase.from("counselling_case").select("id").eq("id", cCase.id);
  check("…and the case IS visible to the authorised user", (adminSees ?? []).length === 1);

  console.log("\n── AUDIT TRAIL ────────────────────────────────────");
  const { rows: auditRows } = await db.query(
    "select count(*)::int as n from activity_log where entity_type in ('counselling_case','welfare_case') and entity_id = any($1)",
    [[cCase.id, wCase.id]],
  );
  check("confidential mutations written to activity_log", auditRows[0].n >= 2, `${auditRows[0].n} entries`);

  await restricted.auth.signOut();
} finally {
  // ── cleanup ──────────────────────────────────────────────────────────────
  await db.query("delete from activity_log where entity_id = any($1)", [
    [...cleanup.counselling, ...cleanup.welfare, ...cleanup.members],
  ]);
  await db.query("delete from counselling_session where case_id = any($1)", [cleanup.counselling]);
  await db.query("delete from counselling_case where id = any($1)", [cleanup.counselling]);
  await db.query("delete from welfare_case where id = any($1)", [cleanup.welfare]);
  await db.query("delete from prayer_request where id = any($1)", [cleanup.prayer]);
  await db.query("delete from followup_activity where followup_id = any($1)", [cleanup.followups]);
  await db.query("delete from shepherd_assignment where followup_id = any($1)", [cleanup.followups]);
  await db.query("delete from followup where id = any($1)", [cleanup.followups]);
  await db.query("delete from visitor_visit where visitor_id = any($1)", [cleanup.visitors]);
  await db.query("delete from visitor where id = any($1)", [cleanup.visitors]);
  await db.query("delete from membership_status_history where member_id = any($1)", [cleanup.members]);
  await db.query("delete from member where id = any($1)", [cleanup.members]);
  for (const id of cleanup.users.filter(Boolean)) {
    await db.query("delete from user_assembly_role where app_user_id = $1", [id]);
    await db.query("delete from app_user where id = $1", [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.end();
  await supabase.auth.signOut();
  console.log("\n  (fixtures and verification user removed)");
}

console.log(
  failures === 0
    ? "\n🎉 M5 verified: visitors, shepherding, prayer — and confidential\n   counselling/welfare records are provably unreadable and unwritable\n   by a role without explicit permission."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
