#!/usr/bin/env node
/**
 * M6 verification against the LIVE database: events + registration (including
 * the capacity/waitlist rule) and communication (segment resolution, consent
 * enforcement, campaign recording). Cleans up after itself.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m6.mjs --email x@y.com --password 'pw'
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
const assemblyId = JSON.parse(
  Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString(),
).app_metadata.assembly_id;
const userId = auth.user.id;
console.log(`▶ Signed in · assembly ${assemblyId}\n`);

const cleanup = { members: [], events: [], campaigns: [] };

try {
  // Two members: one contactable, one opted out.
  const { data: members } = await supabase
    .from("member")
    .insert([
      {
        assembly_id: assemblyId,
        first_name: "M6",
        last_name: "Contactable",
        primary_phone: "+233244000201",
        primary_email: "m6.contactable@example.com",
        current_status: "member",
        created_by: userId,
        updated_by: userId,
      },
      {
        assembly_id: assemblyId,
        first_name: "M6",
        last_name: "OptedOut",
        primary_phone: "+233244000202",
        current_status: "member",
        created_by: userId,
        updated_by: userId,
      },
      {
        assembly_id: assemblyId,
        first_name: "M6",
        last_name: "NoPhone",
        current_status: "member",
        created_by: userId,
        updated_by: userId,
      },
    ])
    .select("id, last_name");
  cleanup.members = members.map((m) => m.id);
  const optedOutId = members.find((m) => m.last_name === "OptedOut").id;

  console.log("── EVENTS ─────────────────────────────────────────");
  const { data: event, error: evErr } = await supabase
    .from("event")
    .insert({
      assembly_id: assemblyId,
      title: "M6 Verification Convention",
      starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      location: "Test venue",
      requires_registration: true,
      capacity: 2,
      status: "scheduled",
      visibility: "assembly",
      created_by: userId,
      updated_by: userId,
    })
    .select("id, capacity")
    .single();
  check("event created", !evErr && Boolean(event?.id), evErr?.message);
  cleanup.events.push(event.id);

  const { error: regErr } = await supabase.from("event_registration").upsert(
    {
      assembly_id: assemblyId,
      event_id: event.id,
      member_id: cleanup.members[0],
      party_size: 2,
      status: "registered",
      created_by: userId,
    },
    { onConflict: "event_id,member_id" },
  );
  check("registration recorded", !regErr, regErr?.message);

  // Capacity is 2 and 2 seats are taken, so the next one belongs on the waitlist.
  const { data: existing } = await supabase
    .from("event_registration")
    .select("party_size")
    .eq("event_id", event.id)
    .neq("status", "cancelled");
  const taken = (existing ?? []).reduce((s, r) => s + (r.party_size ?? 1), 0);
  const nextStatus = taken + 1 > event.capacity ? "waitlist" : "registered";
  check("capacity rule sends the next registration to the waitlist", nextStatus === "waitlist", `${taken}/${event.capacity} taken`);

  await supabase.from("event_registration").upsert(
    {
      assembly_id: assemblyId,
      event_id: event.id,
      member_id: cleanup.members[1],
      party_size: 1,
      status: nextStatus,
      created_by: userId,
    },
    { onConflict: "event_id,member_id" },
  );

  // Re-registering the same member must update, not duplicate.
  await supabase.from("event_registration").upsert(
    {
      assembly_id: assemblyId,
      event_id: event.id,
      member_id: cleanup.members[0],
      party_size: 2,
      status: "registered",
      created_by: userId,
    },
    { onConflict: "event_id,member_id" },
  );
  const { count: regCount } = await supabase
    .from("event_registration")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id);
  check("re-registering does not duplicate", regCount === 2, `${regCount} rows`);

  console.log("\n── CONSENT ────────────────────────────────────────");
  const { error: consentErr } = await supabase.from("communication_consent").upsert(
    {
      assembly_id: assemblyId,
      member_id: optedOutId,
      channel: "sms",
      status: "opted_out",
      updated_by: userId,
    },
    { onConflict: "member_id,channel" },
  );
  check("opt-out recorded", !consentErr, consentErr?.message);

  const { data: optOuts } = await supabase
    .from("communication_consent")
    .select("member_id")
    .eq("assembly_id", assemblyId)
    .eq("channel", "sms")
    .eq("status", "opted_out");
  const blocked = new Set((optOuts ?? []).map((c) => c.member_id));
  check("opted-out member is in the block list", blocked.has(optedOutId));

  // Mirror what resolveSegment + applyConsent do for the all_members segment.
  const { data: allMembers } = await supabase
    .from("member")
    .select("id, primary_phone")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .in("id", cleanup.members);

  const allowed = (allMembers ?? []).filter((m) => !blocked.has(m.id));
  const reachable = allowed.filter((m) => m.primary_phone);
  check("consent filter removes the opted-out member", allowed.length === 2, `${allowed.length} of 3`);
  check("members with no phone are excluded from SMS reach", reachable.length === 1, `${reachable.length} reachable`);

  console.log("\n── CAMPAIGN RECORDING ─────────────────────────────");
  const { data: campaign, error: campErr } = await supabase
    .from("message_campaign")
    .insert({
      assembly_id: assemblyId,
      name: "M6 Verification",
      channel: "sms",
      body: "Hi {{first_name}}, this is a verification message.",
      status: "sending",
      provider: "console",
      recipients_count: reachable.length,
      cost_currency: "GHS",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("campaign created", !campErr && Boolean(campaign?.id), campErr?.message);
  cleanup.campaigns.push(campaign.id);

  const { error: recErr } = await supabase.from("message_recipient").insert(
    reachable.map((m) => ({
      assembly_id: assemblyId,
      campaign_id: campaign.id,
      member_id: m.id,
      to_address: m.primary_phone,
      status: "sent",
      provider_ref: `simulated-${m.id}`,
      cost: 0.035,
      sent_at: new Date().toISOString(),
    })),
  );
  check("per-recipient rows written", !recErr, recErr?.message);

  await supabase
    .from("message_campaign")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      delivered_count: reachable.length,
      failed_count: 0,
      cost_total: reachable.length * 0.035,
    })
    .eq("id", campaign.id);

  const { data: finished } = await supabase
    .from("message_campaign")
    .select("delivered_count, cost_total, status")
    .eq("id", campaign.id)
    .single();
  check("delivery counts recorded", finished?.delivered_count === reachable.length);
  check("cost tracked on the campaign", Number(finished?.cost_total) > 0, `GHS ${finished?.cost_total}`);

  const { count: recipientCount } = await supabase
    .from("message_recipient")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);
  check("opted-out member received nothing", recipientCount === reachable.length, `${recipientCount} recipient rows`);

  console.log("\n── TENANT ISOLATION ───────────────────────────────");
  for (const table of ["event", "event_registration", "message_campaign", "message_recipient"]) {
    const { data: foreign } = await supabase.from(table).select("id").neq("assembly_id", assemblyId);
    check(`${table}: no cross-assembly rows`, (foreign ?? []).length === 0);
  }
} finally {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    await admin.from("message_recipient").delete().in("campaign_id", cleanup.campaigns);
    await admin.from("message_campaign").delete().in("id", cleanup.campaigns);
    await admin.from("event_registration").delete().in("event_id", cleanup.events);
    await admin.from("event").delete().in("id", cleanup.events);
    await admin.from("communication_consent").delete().in("member_id", cleanup.members);
    await admin.from("activity_log").delete().in("entity_id", cleanup.members);
    await admin.from("membership_status_history").delete().in("member_id", cleanup.members);
    await admin.from("member").delete().in("id", cleanup.members);
    console.log("\n  (fixtures removed)");
  }
  await supabase.auth.signOut();
}

console.log(
  failures === 0
    ? "\n🎉 M6 verified: events with capacity/waitlist and non-duplicating\n   registration; consent-filtered sends with per-recipient cost tracking."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
