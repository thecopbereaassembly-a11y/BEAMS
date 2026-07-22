#!/usr/bin/env node
/**
 * M9 verification — the member self-service scope (O-2, docs/09 §4).
 *
 * The claim under test: a user with the `member` role, holding NONE of the
 * broad *.read permissions, sees ONLY their own record — not the congregation.
 * This is the subtlety I flagged in Phase 3: Postgres permissive policies are
 * OR-combined, so the standard "any tenant user reads tenant rows" policy had
 * to be replaced with "holds broad *.read OR row-is-mine".
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-m9.mjs --email x@y.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } =
  process.env;

const MEMBER_EMAIL = "m9-verify-member@example.com";
const MEMBER_PASSWORD = "VerifyOnly!2026x";

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
console.log(`▶ Signed in as staff · assembly ${assemblyId}\n`);

const db = new pg.Client({
  connectionString: undefined,
  ...(() => {
    const u = new URL(DATABASE_URL);
    return {
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      host: u.hostname,
      port: Number(u.port) || 5432,
      database: u.pathname.replace(/^\//, "") || "postgres",
      ssl: { rejectUnauthorized: false },
    };
  })(),
});
await db.connect();

const cleanup = { members: [], contributions: [], types: [], prayers: [], users: [] };

try {
  // Two members: the one who will log in, and another they must NOT see.
  const { data: members } = await supabase
    .from("member")
    .insert([
      {
        assembly_id: assemblyId,
        first_name: "M9",
        last_name: "SelfService",
        primary_phone: "+233244000301",
        current_status: "member",
        created_by: userId,
        updated_by: userId,
      },
      {
        assembly_id: assemblyId,
        first_name: "M9",
        last_name: "OtherPerson",
        primary_phone: "+233244000302",
        current_status: "member",
        created_by: userId,
        updated_by: userId,
      },
    ])
    .select("id, last_name");
  cleanup.members = members.map((m) => m.id);
  const selfMemberId = members.find((m) => m.last_name === "SelfService").id;
  const otherMemberId = members.find((m) => m.last_name === "OtherPerson").id;

  // A gift for each, so "own giving" is a real test.
  const { data: type } = await supabase
    .from("contribution_type")
    .insert({ assembly_id: assemblyId, name: "M9 Verification Offering" })
    .select("id")
    .single();
  cleanup.types.push(type.id);

  const { data: gifts } = await supabase
    .from("contribution")
    .insert([
      {
        assembly_id: assemblyId,
        member_id: selfMemberId,
        contribution_type_id: type.id,
        amount: 100,
        currency: "GHS",
        channel: "cash",
        contributed_on: new Date().toISOString().slice(0, 10),
        created_by: userId,
        updated_by: userId,
      },
      {
        assembly_id: assemblyId,
        member_id: otherMemberId,
        contribution_type_id: type.id,
        amount: 999,
        currency: "GHS",
        channel: "cash",
        contributed_on: new Date().toISOString().slice(0, 10),
        created_by: userId,
        updated_by: userId,
      },
    ])
    .select("id");
  cleanup.contributions = gifts.map((g) => g.id);

  // ── Create the member-role user, linked to the first member ──────────────
  console.log("── ⭐ MEMBER SELF-SERVICE SCOPE (O-2) ──────────────");
  const created = await admin.auth.admin.createUser({
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
    email_confirm: true,
  });
  let memberUserId = created.data?.user?.id;
  if (created.error) {
    const { data: list } = await admin.auth.admin.listUsers();
    memberUserId = list.users.find((x) => x.email === MEMBER_EMAIL)?.id;
    if (memberUserId) await admin.auth.admin.updateUserById(memberUserId, { password: MEMBER_PASSWORD });
  }
  cleanup.users.push(memberUserId);

  await db.query(
    `insert into app_user (id, email, full_name, member_id, is_super_admin, is_active)
     values ($1, $2, 'M9 Verification Member', $3, false, true)
     on conflict (id) do update set member_id = $3, is_super_admin = false, is_active = true`,
    [memberUserId, MEMBER_EMAIL, selfMemberId],
  );
  const { rows: [memberRole] } = await db.query("select id from role where key = 'member'");
  await db.query(
    `insert into user_assembly_role (app_user_id, assembly_id, role_id, is_primary, is_active)
     values ($1, $2, $3, true, true)
     on conflict (app_user_id, assembly_id, role_id) do update set is_active = true`,
    [memberUserId, assemblyId, memberRole.id],
  );

  const asMember = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: mAuth, error: mErr } = await asMember.auth.signInWithPassword({
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
  });
  check("member-role user can sign in", !mErr, mErr?.message);

  const claims = JSON.parse(
    Buffer.from(mAuth.session.access_token.split(".")[1], "base64url").toString(),
  ).app_metadata;
  check("has the member role", claims.role_keys?.includes("member"), JSON.stringify(claims.role_keys));
  check("member_id claim is stamped (self-scope depends on it)", claims.member_id === selfMemberId);
  check("is NOT a super admin", claims.is_super_admin === false);

  // The heart of it: members must see themselves, and nobody else.
  const { data: visibleMembers } = await asMember.from("member").select("id, last_name");
  const ids = (visibleMembers ?? []).map((m) => m.id);
  check(
    "⭐ member sees ONLY their own record",
    ids.length === 1 && ids[0] === selfMemberId,
    `${ids.length} row(s) visible`,
  );
  check(
    "⭐ member CANNOT see the other member",
    !ids.includes(otherMemberId),
  );

  const { data: visibleGiving } = await asMember.from("contribution").select("member_id, amount");
  const givingMembers = [...new Set((visibleGiving ?? []).map((g) => g.member_id))];
  check(
    "⭐ member sees ONLY their own giving",
    givingMembers.length <= 1 && (givingMembers.length === 0 || givingMembers[0] === selfMemberId),
    `${(visibleGiving ?? []).length} gift(s) visible`,
  );
  check(
    "⭐ the other member's GHS 999 gift is invisible",
    !(visibleGiving ?? []).some((g) => Number(g.amount) === 999),
  );

  // Members may raise their own prayer request (self-write path).
  const { data: prayer, error: prayErr } = await asMember
    .from("prayer_request")
    .insert({
      assembly_id: assemblyId,
      member_id: selfMemberId,
      body: "M9 self-service verification request",
      privacy: "leaders_only",
      status: "open",
    })
    .select("id")
    .single();
  check("member CAN submit their own prayer request", !prayErr, prayErr?.message);
  if (prayer) cleanup.prayers.push(prayer.id);

  // But must not be able to write someone else's data.
  const { error: badWrite } = await asMember
    .from("member")
    .update({ last_name: "Hacked" })
    .eq("id", otherMemberId);
  const { data: unchanged } = await supabase
    .from("member")
    .select("last_name")
    .eq("id", otherMemberId)
    .single();
  check(
    "⭐ member CANNOT modify another member's record",
    unchanged?.last_name === "OtherPerson",
    badWrite ? `refused: ${badWrite.code}` : "no rows matched (RLS)",
  );

  // Confidential areas stay shut for members too.
  const { data: counselling } = await asMember.from("counselling_case").select("id");
  check("🔒 member CANNOT read counselling", (counselling ?? []).length === 0);

  // And staff still see everyone — proving the zeros above are scope, not emptiness.
  const { data: staffSees } = await supabase
    .from("member")
    .select("id")
    .in("id", cleanup.members);
  check("…staff still see BOTH members", (staffSees ?? []).length === 2);

  await asMember.auth.signOut();
} finally {
  await db.query("delete from prayer_request where id = any($1)", [cleanup.prayers]);
  await db.query("delete from activity_log where entity_id = any($1)", [
    [...cleanup.contributions, ...cleanup.members],
  ]);
  await db.query("delete from contribution where id = any($1)", [cleanup.contributions]);
  await db.query("delete from contribution_type where id = any($1)", [cleanup.types]);
  await db.query("delete from membership_status_history where member_id = any($1)", [cleanup.members]);
  for (const id of cleanup.users.filter(Boolean)) {
    await db.query("update app_user set member_id = null where id = $1", [id]);
    await db.query("delete from user_assembly_role where app_user_id = $1", [id]);
    await db.query("delete from app_user where id = $1", [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.query("delete from member where id = any($1)", [cleanup.members]);
  await db.end();
  await supabase.auth.signOut();
  console.log("\n  (fixtures and verification user removed)");
}

console.log(
  failures === 0
    ? "\n🎉 M9 verified: a member-role user sees only their own record and giving,\n   can raise their own prayer request, cannot modify anyone else's data,\n   and confidential areas stay closed."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
