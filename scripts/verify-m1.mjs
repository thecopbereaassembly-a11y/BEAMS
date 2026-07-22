#!/usr/bin/env node
/**
 * M1 end-to-end verification against the LIVE database, as a real authenticated
 * user (anon key + session → RLS fully enforced). Exercises exactly the
 * operations the member repository performs, then cleans up after itself.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m1.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const email = arg("--email");
const password = arg("--password");
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

console.log("▶ Signing in…");
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (authErr) {
  console.error(`❌ ${authErr.message}`);
  process.exit(1);
}
const claims = JSON.parse(
  Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString(),
).app_metadata;
const assemblyId = claims.assembly_id;
const userId = auth.user.id;
console.log(`  signed in · assembly ${assemblyId}\n`);

console.log("── CREATE ─────────────────────────────────────────");
const { data: created, error: createErr } = await supabase
  .from("member")
  .insert({
    assembly_id: assemblyId,
    first_name: "Verification",
    last_name: "TestRecord",
    primary_phone: "+233244000111",
    primary_email: "verify.test@beams.local",
    current_status: "member",
    is_water_baptized: true,
    created_by: userId,
    updated_by: userId,
  })
  .select("*")
  .single();

check("member inserted under RLS", !createErr && Boolean(created?.id), createErr?.message);
if (!created) {
  console.error("\n❌ Cannot continue without a created row.");
  process.exit(1);
}
const memberId = created.id;
check("assembly_id stamped correctly", created.assembly_id === assemblyId);
check("audit columns populated", Boolean(created.created_at && created.created_by === userId));

console.log("\n── STATUS HISTORY (ADR-007) ───────────────────────");
const { error: histErr } = await supabase.from("membership_status_history").insert({
  assembly_id: assemblyId,
  member_id: memberId,
  status: "member",
  reason: "Member created",
  created_by: userId,
});
check("status history row written", !histErr, histErr?.message);

console.log("\n── READ / SEARCH ──────────────────────────────────");
const { data: byId } = await supabase
  .from("member")
  .select("*")
  .eq("id", memberId)
  .is("deleted_at", null)
  .maybeSingle();
check("fetch by id", byId?.id === memberId);

const { data: searched } = await supabase
  .from("member")
  .select("*")
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null)
  .or("first_name.ilike.%Verific%,last_name.ilike.%Verific%");
check("search by name (ilike)", (searched ?? []).some((m) => m.id === memberId));

const { count: totalCount } = await supabase
  .from("member")
  .select("*", { count: "exact", head: true })
  .eq("assembly_id", assemblyId)
  .is("deleted_at", null);
check("exact count for pagination", typeof totalCount === "number", `${totalCount} member(s)`);

console.log("\n── UPDATE ─────────────────────────────────────────");
const { data: updated, error: updErr } = await supabase
  .from("member")
  .update({ last_name: "Updated", current_status: "inactive", updated_by: userId })
  .eq("id", memberId)
  .eq("assembly_id", assemblyId)
  .select("*")
  .single();
check("member updated", !updErr && updated?.last_name === "Updated", updErr?.message);
check("updated_at trigger fired", updated?.updated_at !== created.updated_at);

console.log("\n── SOFT DELETE ────────────────────────────────────");
const { error: delErr } = await supabase
  .from("member")
  .update({ deleted_at: new Date().toISOString(), updated_by: userId })
  .eq("id", memberId)
  .eq("assembly_id", assemblyId);
check("soft delete applied", !delErr, delErr?.message);

const { data: afterDelete } = await supabase
  .from("member")
  .select("id")
  .eq("id", memberId)
  .is("deleted_at", null)
  .maybeSingle();
check("hidden from active queries", afterDelete === null);

const { data: stillThere } = await supabase
  .from("member")
  .select("id, deleted_at")
  .eq("id", memberId)
  .maybeSingle();
check("row still exists (recoverable)", stillThere?.id === memberId);

console.log("\n── TENANT ISOLATION ───────────────────────────────");
const { data: crossTenant } = await supabase
  .from("member")
  .select("id")
  .neq("assembly_id", assemblyId);
check(
  "cannot read other assemblies' members",
  (crossTenant ?? []).length === 0,
  `${(crossTenant ?? []).length} foreign row(s) visible`,
);

console.log("\n── AUDIT TRAIL ────────────────────────────────────");
const { data: auditRows } = await supabase
  .from("activity_log")
  .select("action, entity_type")
  .eq("entity_type", "member")
  .eq("entity_id", memberId);
check(
  "audit rows written by trigger",
  (auditRows ?? []).length >= 2,
  `${(auditRows ?? []).length} entries (insert/update/delete)`,
);

// ── cleanup (service role: remove the test record entirely) ─────────────────
if (SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await admin.from("activity_log").delete().eq("entity_id", memberId);
  await admin.from("membership_status_history").delete().eq("member_id", memberId);
  await admin.from("member").delete().eq("id", memberId);
  console.log("\n  (test record removed)");
}

await supabase.auth.signOut();

console.log(
  failures === 0
    ? "\n🎉 M1 verified end to end: create → read → search → update → soft-delete,\n   with tenant isolation and audit trail intact."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
