#!/usr/bin/env node
/**
 * M3 end-to-end verification against the LIVE database as a real authenticated
 * user. The critical test is IDEMPOTENCY REPLAY: re-sending the same queued
 * marks (as happens when a device reconnects) must update, never duplicate.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m3.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

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
console.log(`▶ Signed in · assembly ${assemblyId}\n`);

const cleanup = { members: [], sessions: [] };

// Fixture members
const { data: fixtureMembers } = await supabase
  .from("member")
  .insert(
    ["Alpha", "Beta", "Gamma"].map((n) => ({
      assembly_id: assemblyId,
      first_name: "M3",
      last_name: n,
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    })),
  )
  .select("id");
cleanup.members = fixtureMembers.map((m) => m.id);

console.log("── SESSION ────────────────────────────────────────");
const { data: serviceType } = await supabase
  .from("service_type")
  .select("id, name")
  .eq("assembly_id", assemblyId)
  .limit(1)
  .single();
check("service type available (from seed)", Boolean(serviceType?.id), serviceType?.name);

const serviceDate = "2030-01-06"; // future date, cannot clash with real data
const { data: session, error: sessionErr } = await supabase
  .from("attendance_session")
  .insert({
    assembly_id: assemblyId,
    service_type_id: serviceType.id,
    service_date: serviceDate,
    title: "M3 Verification Service",
    status: "open",
    created_by: userId,
    updated_by: userId,
  })
  .select("*")
  .single();
check("session created", !sessionErr && Boolean(session?.id), sessionErr?.message);
cleanup.sessions.push(session.id);

// Duplicate session must be rejected by the unique constraint.
const { error: dupErr } = await supabase.from("attendance_session").insert({
  assembly_id: assemblyId,
  service_type_id: serviceType.id,
  service_date: serviceDate,
  status: "open",
});
check("duplicate session rejected by constraint", Boolean(dupErr), dupErr?.code);

console.log("\n── CAPTURE (online) ───────────────────────────────");
const marks = cleanup.members.map((memberId, i) => ({
  assembly_id: assemblyId,
  session_id: session.id,
  member_id: memberId,
  status: i === 2 ? "absent" : "present",
  client_uuid: randomUUID(),
  captured_offline: false,
  created_by: userId,
}));

const { error: markErr } = await supabase
  .from("attendance_record")
  .upsert(marks, { onConflict: "session_id,member_id" });
check("marks saved", !markErr, markErr?.message);

const { count: afterFirst } = await supabase
  .from("attendance_record")
  .select("*", { count: "exact", head: true })
  .eq("session_id", session.id);
check("three records written", afterFirst === 3, `${afterFirst} rows`);

console.log("\n── ⭐ IDEMPOTENCY REPLAY (the offline guarantee) ───");
// Exactly what the sync engine does when a device reconnects and re-sends
// marks it is not sure were delivered.
const { error: replayErr } = await supabase
  .from("attendance_record")
  .upsert(marks, { onConflict: "session_id,member_id" });
check("replaying the identical batch succeeds", !replayErr, replayErr?.message);

const { count: afterReplay } = await supabase
  .from("attendance_record")
  .select("*", { count: "exact", head: true })
  .eq("session_id", session.id);
check(
  "NO duplicates created by replay",
  afterReplay === 3,
  `${afterReplay} rows (expected 3)`,
);

// A queued correction (offline status change) replayed with a NEW client_uuid
// must update the existing row, not add one.
const corrected = [
  {
    assembly_id: assemblyId,
    session_id: session.id,
    member_id: cleanup.members[2],
    status: "present",
    client_uuid: randomUUID(),
    captured_offline: true,
    created_by: userId,
  },
];
await supabase
  .from("attendance_record")
  .upsert(corrected, { onConflict: "session_id,member_id" });

const { count: afterCorrection } = await supabase
  .from("attendance_record")
  .select("*", { count: "exact", head: true })
  .eq("session_id", session.id);
const { data: correctedRow } = await supabase
  .from("attendance_record")
  .select("status, captured_offline")
  .eq("session_id", session.id)
  .eq("member_id", cleanup.members[2])
  .single();

check("offline correction updates in place", afterCorrection === 3, `${afterCorrection} rows`);
check("corrected status applied", correctedRow?.status === "present");
check("captured_offline flag recorded", correctedRow?.captured_offline === true);

console.log("\n── HEADCOUNT MODE ─────────────────────────────────");
const counts = [
  { assembly_id: assemblyId, session_id: session.id, category: "men", headcount: 120 },
  { assembly_id: assemblyId, session_id: session.id, category: "women", headcount: 180 },
];
const { error: hcErr } = await supabase
  .from("attendance_count")
  .upsert(counts, { onConflict: "session_id,category" });
check("headcounts saved", !hcErr, hcErr?.message);

await supabase
  .from("attendance_count")
  .upsert(
    [{ assembly_id: assemblyId, session_id: session.id, category: "men", headcount: 125 }],
    { onConflict: "session_id,category" },
  );
const { data: hcRows } = await supabase
  .from("attendance_count")
  .select("category, headcount")
  .eq("session_id", session.id);
check("headcount re-save updates, no duplicate", hcRows?.length === 2, `${hcRows?.length} rows`);
check(
  "updated headcount value applied",
  hcRows?.find((r) => r.category === "men")?.headcount === 125,
);

console.log("\n── DERIVED DATA ───────────────────────────────────");
const { data: history } = await supabase
  .from("attendance_record")
  .select("status")
  .eq("member_id", cleanup.members[0]);
check("member attendance history readable", (history ?? []).length === 1);

const { data: presentRows } = await supabase
  .from("attendance_record")
  .select("member_id, status")
  .eq("session_id", session.id)
  .in("status", ["present", "late"]);
check("present/late counted for the session", (presentRows ?? []).length === 3, `${presentRows?.length}`);

console.log("\n── TENANT ISOLATION ───────────────────────────────");
for (const table of ["attendance_session", "attendance_record", "attendance_count"]) {
  const { data: foreign } = await supabase.from(table).select("id").neq("assembly_id", assemblyId);
  check(`${table}: no cross-assembly rows`, (foreign ?? []).length === 0);
}

// ── cleanup ────────────────────────────────────────────────────────────────
if (SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("attendance_record").delete().in("session_id", cleanup.sessions);
  await admin.from("attendance_count").delete().in("session_id", cleanup.sessions);
  await admin.from("attendance_session").delete().in("id", cleanup.sessions);
  await admin.from("activity_log").delete().in("entity_id", cleanup.members);
  await admin.from("membership_status_history").delete().in("member_id", cleanup.members);
  await admin.from("member").delete().in("id", cleanup.members);
  console.log("\n  (fixtures removed)");
}

await supabase.auth.signOut();
console.log(
  failures === 0
    ? "\n🎉 M3 verified: sessions, roster capture, headcount mode, derived data,\n   tenant isolation — and replaying queued marks NEVER duplicates."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
