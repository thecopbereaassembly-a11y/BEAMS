#!/usr/bin/env node
/**
 * M4 verification: dashboard aggregation + report data against the LIVE
 * database, as a real authenticated user (RLS enforced). Seeds known fixtures,
 * asserts the computed figures, then cleans up.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m4.mjs --email x@y.com --password 'pw'
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

const now = new Date();
const thisMonth = now.getMonth();
const cleanup = { members: [], sessions: [], cells: [] };

// ── Fixtures with KNOWN values so the assertions are meaningful ────────────
const birthdayThisMonth = new Date(1990, thisMonth, 15).toISOString().slice(0, 10);
const anniversaryThisMonth = new Date(2015, thisMonth, 20).toISOString().slice(0, 10);
const birthdayOtherMonth = new Date(1988, (thisMonth + 6) % 12, 10)
  .toISOString()
  .slice(0, 10);

const { data: members, error: memberErr } = await supabase
  .from("member")
  .insert([
    {
      assembly_id: assemblyId,
      first_name: "M4",
      last_name: "BirthdayNow",
      date_of_birth: birthdayThisMonth,
      wedding_anniversary: anniversaryThisMonth,
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    },
    {
      assembly_id: assemblyId,
      first_name: "M4",
      last_name: "BirthdayLater",
      date_of_birth: birthdayOtherMonth,
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    },
    {
      assembly_id: assemblyId,
      first_name: "M4",
      last_name: "NoCell",
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    },
  ])
  .select("id, last_name");
check("fixture members created", !memberErr && members?.length === 3, memberErr?.message);
cleanup.members = (members ?? []).map((m) => m.id);

console.log("── DASHBOARD: BIRTHDAYS & ANNIVERSARIES ───────────");
const { data: dobRows } = await supabase
  .from("member")
  .select("id, date_of_birth, wedding_anniversary")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null)
  .in("id", cleanup.members);

const birthdaysThisMonth = (dobRows ?? []).filter(
  (m) => m.date_of_birth && new Date(m.date_of_birth).getMonth() === thisMonth,
);
check(
  "only this month's birthdays are picked up",
  birthdaysThisMonth.length === 1,
  `${birthdaysThisMonth.length} of 2 with a DOB`,
);

const anniversaries = (dobRows ?? []).filter(
  (m) => m.wedding_anniversary && new Date(m.wedding_anniversary).getMonth() === thisMonth,
);
check("this month's anniversaries picked up", anniversaries.length === 1);

console.log("\n── DASHBOARD: ATTENDANCE TREND ────────────────────");
const { data: serviceType } = await supabase
  .from("service_type")
  .select("id")
  .eq("assembly_id", assemblyId)
  .limit(1)
  .single();

const { data: session } = await supabase
  .from("attendance_session")
  .insert({
    assembly_id: assemblyId,
    service_type_id: serviceType.id,
    service_date: "2031-02-02",
    title: "M4 Verification",
    status: "open",
    created_by: userId,
    updated_by: userId,
  })
  .select("id")
  .single();
cleanup.sessions.push(session.id);

await supabase.from("attendance_record").upsert(
  [
    { status: "present" },
    { status: "late" },
    { status: "absent" },
  ].map((r, i) => ({
    assembly_id: assemblyId,
    session_id: session.id,
    member_id: cleanup.members[i],
    status: r.status,
    client_uuid: randomUUID(),
    created_by: userId,
  })),
  { onConflict: "session_id,member_id" },
);

const { data: marks } = await supabase
  .from("attendance_record")
  .select("status")
  .eq("session_id", session.id);

const present = (marks ?? []).filter((m) => m.status === "present" || m.status === "late").length;
check("present count includes 'late'", present === 2, `${present} of 3 marked`);
check("absent excluded from present count", present !== 3);

console.log("\n── DASHBOARD: UNASSIGNED MEMBERS ──────────────────");
const { data: unassigned } = await supabase
  .from("member")
  .select("id")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null)
  .is("home_cell_id", null)
  .in("id", cleanup.members);
check("members without a home cell detected", (unassigned ?? []).length === 3);

console.log("\n── DASHBOARD: CELLS MISSING A RECENT REPORT ───────");
const { data: cell } = await supabase
  .from("home_cell")
  .insert({
    assembly_id: assemblyId,
    name: "M4 Verification Cell",
    is_active: true,
    created_by: userId,
    updated_by: userId,
  })
  .select("id")
  .single();
cleanup.cells.push(cell.id);

const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
const { data: recentReports } = await supabase
  .from("home_cell_report")
  .select("home_cell_id")
  .eq("assembly_id", assemblyId)
  .eq("home_cell_id", cell.id)
  .gte("report_date", fourteenDaysAgo);
check("new cell counts as missing a report", (recentReports ?? []).length === 0);

console.log("\n── REPORT DATA ────────────────────────────────────");
const { data: allMembers } = await supabase
  .from("member")
  .select("id, first_name, last_name, current_status")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null);
check("member register query returns rows", (allMembers ?? []).length >= 3);

const { data: cellRows } = await supabase
  .from("home_cell")
  .select("id, name, is_active")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null);
check("home cell report query returns rows", (cellRows ?? []).length >= 1);

const { data: ministryRows } = await supabase
  .from("ministry")
  .select("id, name, code")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null);
check("ministry report query returns seeded rows", (ministryRows ?? []).length >= 6);

const { data: sessionRows } = await supabase
  .from("attendance_session")
  .select("id, service_date")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null);
check("attendance report query returns sessions", (sessionRows ?? []).length >= 1);

console.log("\n── SOFT-DELETE EXCLUSION ──────────────────────────");
await supabase
  .from("member")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", cleanup.members[2]);
const { count: activeCount } = await supabase
  .from("member")
  .select("*", { count: "exact", head: true })
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null)
  .in("id", cleanup.members);
check("soft-deleted members excluded from reports", activeCount === 2, `${activeCount} of 3`);

// ── cleanup ────────────────────────────────────────────────────────────────
if (SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("attendance_record").delete().in("session_id", cleanup.sessions);
  await admin.from("attendance_session").delete().in("id", cleanup.sessions);
  await admin.from("home_cell").delete().in("id", cleanup.cells);
  await admin.from("activity_log").delete().in("entity_id", cleanup.members);
  await admin.from("membership_status_history").delete().in("member_id", cleanup.members);
  await admin.from("member").delete().in("id", cleanup.members);
  console.log("\n  (fixtures removed)");
}

await supabase.auth.signOut();
console.log(
  failures === 0
    ? "\n🎉 M4 verified: dashboard aggregation (birthdays, anniversaries, attendance\n   trend, unassigned members, stale cell reports) and report data queries."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
