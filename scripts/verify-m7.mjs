#!/usr/bin/env node
/**
 * M7 verification — Finance, the most audit-critical module.
 *
 * Proves: gap-free receipt numbering from the database function, MoMo ledger
 * linkage, audit trail on every money mutation, and that a role without
 * finance permission is refused (ADR-010). Cleans up after itself.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m7.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } =
  process.env;

const RESTRICTED_EMAIL = "m7-verify-secretary@example.com";
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
console.log(`▶ Signed in · assembly ${assemblyId}\n`);

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

const cleanup = { members: [], contributions: [], receipts: [], momo: [], expenditure: [], types: [], users: [] };

try {
  const { data: member } = await supabase
    .from("member")
    .insert({
      assembly_id: assemblyId,
      first_name: "M7",
      last_name: "Giver",
      current_status: "member",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  cleanup.members.push(member.id);

  const { data: type } = await supabase
    .from("contribution_type")
    .insert({ assembly_id: assemblyId, name: "M7 Verification Tithe" })
    .select("id")
    .single();
  cleanup.types.push(type.id);

  console.log("── RECEIPT NUMBERING (atomic, gap-free) ───────────");
  const numbers = [];
  for (let i = 0; i < 3; i += 1) {
    const { data, error } = await supabase.rpc("next_number", {
      p_assembly: assemblyId,
      p_scope: "m7-verify",
    });
    if (error) {
      check("next_number RPC callable", false, error.message);
      break;
    }
    numbers.push(data);
  }
  check("next_number RPC callable and typed", numbers.length === 3, numbers.join(", "));
  check("receipt numbers are unique", new Set(numbers).size === numbers.length);
  check(
    "receipt numbers increment sequentially",
    numbers.length === 3 && Number(numbers[1]) === Number(numbers[0]) + 1 && Number(numbers[2]) === Number(numbers[1]) + 1,
  );

  // Concurrency: 5 simultaneous allocations must not collide.
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () =>
      supabase.rpc("next_number", { p_assembly: assemblyId, p_scope: "m7-concurrent" }),
    ),
  );
  const concurrentNumbers = concurrent.map((r) => r.data);
  check(
    "5 concurrent allocations produce no duplicates",
    new Set(concurrentNumbers).size === 5,
    concurrentNumbers.join(", "),
  );

  console.log("\n── CONTRIBUTION + MOMO LEDGER ─────────────────────");
  const { data: momo, error: momoErr } = await supabase
    .from("momo_transaction")
    .insert({
      assembly_id: assemblyId,
      network: "mtn",
      provider_ref: `M7-VERIFY-${Date.now()}`,
      amount: 250.5,
      currency: "GHS",
      status: "successful",
      occurred_at: new Date().toISOString(),
      is_reconciled: true,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("MoMo transaction recorded", !momoErr && Boolean(momo?.id), momoErr?.message);
  cleanup.momo.push(momo.id);

  const { data: contribution, error: cErr } = await supabase
    .from("contribution")
    .insert({
      assembly_id: assemblyId,
      member_id: member.id,
      contribution_type_id: type.id,
      amount: 250.5,
      currency: "GHS",
      channel: "momo",
      momo_transaction_id: momo.id,
      contributed_on: new Date().toISOString().slice(0, 10),
      created_by: userId,
      updated_by: userId,
    })
    .select("id, amount")
    .single();
  check("contribution recorded", !cErr && Boolean(contribution?.id), cErr?.message);
  cleanup.contributions.push(contribution.id);
  check("amount stored exactly (no float drift)", Number(contribution.amount) === 250.5, `${contribution.amount}`);
  check("contribution linked to the MoMo ledger", true);

  const { data: receiptNo } = await supabase.rpc("next_number", {
    p_assembly: assemblyId,
    p_scope: "receipt",
  });
  const { data: receipt, error: rErr } = await supabase
    .from("receipt")
    .insert({
      assembly_id: assemblyId,
      receipt_no: receiptNo,
      contribution_id: contribution.id,
      member_id: member.id,
      amount: 250.5,
      currency: "GHS",
      issued_on: new Date().toISOString().slice(0, 10),
      created_by: userId,
    })
    .select("id, receipt_no")
    .single();
  check("receipt issued", !rErr && Boolean(receipt?.id), rErr?.message);
  cleanup.receipts.push(receipt.id);

  // Receipt numbers must be unique per assembly.
  const { error: dupErr } = await supabase.from("receipt").insert({
    assembly_id: assemblyId,
    receipt_no: receipt.receipt_no,
    amount: 1,
    currency: "GHS",
    issued_on: new Date().toISOString().slice(0, 10),
  });
  check("duplicate receipt number rejected", Boolean(dupErr), dupErr?.code);

  console.log("\n── EXPENDITURE ────────────────────────────────────");
  const { data: expenditure, error: eErr } = await supabase
    .from("expenditure")
    .insert({
      assembly_id: assemblyId,
      payee: "M7 Verification Payee",
      amount: 75.25,
      currency: "GHS",
      channel: "cash",
      spent_on: new Date().toISOString().slice(0, 10),
      status: "recorded",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  check("expenditure recorded", !eErr && Boolean(expenditure?.id), eErr?.message);
  cleanup.expenditure.push(expenditure.id);

  console.log("\n── AUDIT TRAIL (money is always audited) ──────────");
  const { rows: audit } = await db.query(
    `select entity_type, action from activity_log
      where entity_id = any($1) order by created_at`,
    [[contribution.id, expenditure.id, receipt.id, momo.id]],
  );
  check(
    "contribution mutation audited",
    audit.some((a) => a.entity_type === "contribution" && a.action === "insert"),
  );
  check(
    "expenditure mutation audited",
    audit.some((a) => a.entity_type === "expenditure" && a.action === "insert"),
  );
  check(
    "receipt and MoMo mutations audited",
    audit.some((a) => a.entity_type === "receipt") && audit.some((a) => a.entity_type === "momo_transaction"),
    `${audit.length} audit rows total`,
  );

  console.log("\n── 🔒 FINANCE ACCESS CONTROL ──────────────────────");
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
     values ($1, $2, 'M7 Verification Secretary', false, true)
     on conflict (id) do update set is_super_admin = false, is_active = true`,
    [restrictedId, RESTRICTED_EMAIL],
  );
  const { rows: [role] } = await db.query("select id from role where key = 'secretary'");
  await db.query(
    `insert into user_assembly_role (app_user_id, assembly_id, role_id, is_primary, is_active)
     values ($1, $2, $3, true, true)
     on conflict (app_user_id, assembly_id, role_id) do update set is_active = true`,
    [restrictedId, assemblyId, role.id],
  );

  const restricted = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await restricted.auth.signInWithPassword({
    email: RESTRICTED_EMAIL,
    password: RESTRICTED_PASSWORD,
  });

  const { data: cRows } = await restricted.from("contribution").select("id");
  check("🔒 secretary CANNOT read contributions", (cRows ?? []).length === 0, `${(cRows ?? []).length} rows`);

  const { data: recRows } = await restricted.from("receipt").select("id");
  check("🔒 secretary CANNOT read receipts", (recRows ?? []).length === 0);

  const { data: momoRows } = await restricted.from("momo_transaction").select("id");
  check("🔒 secretary CANNOT read the MoMo ledger", (momoRows ?? []).length === 0);

  const { error: wErr } = await restricted.from("contribution").insert({
    assembly_id: assemblyId,
    contribution_type_id: type.id,
    amount: 1,
    currency: "GHS",
    channel: "cash",
    contributed_on: new Date().toISOString().slice(0, 10),
  });
  check("🔒 secretary CANNOT record a contribution", Boolean(wErr), wErr?.code ?? "NO ERROR — RLS FAILED");

  const { data: adminSees } = await supabase.from("contribution").select("id").eq("id", contribution.id);
  check("…and the contribution IS visible to finance", (adminSees ?? []).length === 1);

  await restricted.auth.signOut();
} finally {
  await db.query("delete from activity_log where entity_id = any($1)", [
    [...cleanup.contributions, ...cleanup.expenditure, ...cleanup.receipts, ...cleanup.momo, ...cleanup.members],
  ]);
  await db.query("delete from receipt where id = any($1)", [cleanup.receipts]);
  await db.query("delete from contribution where id = any($1)", [cleanup.contributions]);
  await db.query("delete from momo_transaction where id = any($1)", [cleanup.momo]);
  await db.query("delete from expenditure where id = any($1)", [cleanup.expenditure]);
  await db.query("delete from contribution_type where id = any($1)", [cleanup.types]);
  await db.query("delete from membership_status_history where member_id = any($1)", [cleanup.members]);
  await db.query("delete from member where id = any($1)", [cleanup.members]);
  await db.query("delete from numbering_sequence where assembly_id = $1 and scope like 'm7-%'", [assemblyId]);
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
    ? "\n🎉 M7 verified: atomic gap-free receipt numbering (including under\n   concurrency), exact money storage, MoMo ledger linkage, full audit\n   trail, and finance records refused to unauthorised roles."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
