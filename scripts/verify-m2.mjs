#!/usr/bin/env node
/**
 * M2 end-to-end verification against the LIVE database as a real authenticated
 * user (RLS enforced): Home Cells, Ministries, Leadership. Cleans up after itself.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m2.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";

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
const meta = JSON.parse(
  Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString(),
).app_metadata;
const assemblyId = meta.assembly_id;
const userId = auth.user.id;
console.log(`▶ Signed in · assembly ${assemblyId}\n`);

const created = { members: [], cells: [], ministries: [], appointments: [] };

// A member to move around between cells/ministries.
const { data: testMember } = await supabase
  .from("member")
  .insert({
    assembly_id: assemblyId,
    first_name: "M2",
    last_name: "Fixture",
    current_status: "member",
    created_by: userId,
    updated_by: userId,
  })
  .select("id")
  .single();
created.members.push(testMember.id);

console.log("── HOME CELLS ─────────────────────────────────────");
const { data: cell, error: cellErr } = await supabase
  .from("home_cell")
  .insert({
    assembly_id: assemblyId,
    name: "Verification Cell",
    code: "VC1",
    meeting_day: "Wednesday",
    meeting_time: "18:30",
    location: "Test location",
    is_active: true,
    created_by: userId,
    updated_by: userId,
  })
  .select("*")
  .single();
check("cell created", !cellErr && Boolean(cell?.id), cellErr?.message);
if (cell) created.cells.push(cell.id);

const { error: rosterErr } = await supabase.from("home_cell_member").upsert(
  {
    assembly_id: assemblyId,
    home_cell_id: cell.id,
    member_id: testMember.id,
    role: "leader",
    is_active: true,
    created_by: userId,
  },
  { onConflict: "home_cell_id,member_id" },
);
check("member added to cell roster", !rosterErr, rosterErr?.message);

const { error: cachedErr } = await supabase
  .from("member")
  .update({ home_cell_id: cell.id })
  .eq("id", testMember.id);
check("member.home_cell_id cached column updated", !cachedErr, cachedErr?.message);

// Upsert again — must not duplicate (tests the unique constraint path).
await supabase.from("home_cell_member").upsert(
  {
    assembly_id: assemblyId,
    home_cell_id: cell.id,
    member_id: testMember.id,
    role: "member",
    is_active: true,
  },
  { onConflict: "home_cell_id,member_id" },
);
const { count: rosterCount } = await supabase
  .from("home_cell_member")
  .select("*", { count: "exact", head: true })
  .eq("home_cell_id", cell.id);
check("re-adding does not duplicate the roster row", rosterCount === 1, `${rosterCount} row(s)`);

const { error: reportErr } = await supabase.from("home_cell_report").insert({
  assembly_id: assemblyId,
  home_cell_id: cell.id,
  report_date: new Date().toISOString().slice(0, 10),
  attendance_count: 12,
  visitors_count: 2,
  offering_amount: 150.75,
  offering_currency: "GHS",
  testimonies: "Verification run",
  created_by: userId,
  updated_by: userId,
});
check("weekly report submitted", !reportErr, reportErr?.message);

const { data: reports } = await supabase
  .from("home_cell_report")
  .select("attendance_count, offering_amount")
  .eq("home_cell_id", cell.id);
check(
  "report readable with correct values",
  reports?.[0]?.attendance_count === 12 && Number(reports?.[0]?.offering_amount) === 150.75,
);

console.log("\n── MINISTRIES ─────────────────────────────────────");
const { data: ministry, error: minErr } = await supabase
  .from("ministry")
  .insert({
    assembly_id: assemblyId,
    name: "Verification Ministry",
    code: "VMIN",
    category: "ministry",
    is_active: true,
    created_by: userId,
    updated_by: userId,
  })
  .select("*")
  .single();
check("ministry created", !minErr && Boolean(ministry?.id), minErr?.message);
if (ministry) created.ministries.push(ministry.id);

const { error: minMemberErr } = await supabase.from("ministry_member").upsert(
  {
    assembly_id: assemblyId,
    ministry_id: ministry.id,
    member_id: testMember.id,
    is_active: true,
    created_by: userId,
  },
  { onConflict: "ministry_id,member_id" },
);
check("member added to ministry", !minMemberErr, minMemberErr?.message);

const { data: seededMinistries } = await supabase
  .from("ministry")
  .select("code")
  .eq("assembly_id", assemblyId)
  .in("code", ["PEMEM", "PEWOMOM", "PENSA"]);
check(
  "seeded CoP ministries present",
  (seededMinistries ?? []).length === 3,
  `${(seededMinistries ?? []).length}/3`,
);

console.log("\n── LEADERSHIP ─────────────────────────────────────");
const { data: position } = await supabase
  .from("leadership_position")
  .select("id, name")
  .eq("name", "Elder")
  .maybeSingle();
check("leadership positions catalog readable", Boolean(position?.id));

const { data: appointment, error: apptErr } = await supabase
  .from("leadership_appointment")
  .insert({
    assembly_id: assemblyId,
    member_id: testMember.id,
    position_id: position.id,
    portfolio: "Verification portfolio",
    appointed_on: new Date().toISOString().slice(0, 10),
    is_current: true,
    created_by: userId,
    updated_by: userId,
  })
  .select("id")
  .single();
check("appointment recorded", !apptErr && Boolean(appointment?.id), apptErr?.message);
if (appointment) created.appointments.push(appointment.id);

const { error: endErr } = await supabase
  .from("leadership_appointment")
  .update({ is_current: false, ended_on: new Date().toISOString().slice(0, 10) })
  .eq("id", appointment.id);
check("appointment ended (history retained)", !endErr, endErr?.message);

const { data: stillThere } = await supabase
  .from("leadership_appointment")
  .select("id, is_current")
  .eq("id", appointment.id)
  .maybeSingle();
check("ended appointment still on record", stillThere?.is_current === false);

console.log("\n── TENANT ISOLATION ───────────────────────────────");
for (const table of ["home_cell", "ministry", "leadership_appointment", "home_cell_report"]) {
  const { data: foreign } = await supabase.from(table).select("id").neq("assembly_id", assemblyId);
  check(`${table}: no cross-assembly rows`, (foreign ?? []).length === 0);
}

// ── cleanup ────────────────────────────────────────────────────────────────
if (SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("leadership_appointment").delete().in("id", created.appointments);
  await admin.from("home_cell_report").delete().in("home_cell_id", created.cells);
  await admin.from("home_cell_member").delete().in("home_cell_id", created.cells);
  await admin.from("ministry_member").delete().in("ministry_id", created.ministries);
  await admin.from("member").update({ home_cell_id: null }).in("id", created.members);
  await admin.from("home_cell").delete().in("id", created.cells);
  await admin.from("ministry").delete().in("id", created.ministries);
  await admin.from("activity_log").delete().in("entity_id", created.members);
  await admin.from("membership_status_history").delete().in("member_id", created.members);
  await admin.from("member").delete().in("id", created.members);
  console.log("\n  (fixtures removed)");
}

await supabase.auth.signOut();
console.log(
  failures === 0
    ? "\n🎉 M2 verified end to end: home cells + roster + weekly reports,\n   ministries + roster, leadership appointments, tenant isolation."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
