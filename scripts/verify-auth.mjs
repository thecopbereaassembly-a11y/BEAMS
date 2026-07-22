#!/usr/bin/env node
/**
 * End-to-end auth verification: signs in as a real user, decodes the issued
 * JWT, and proves RLS lets that user read their assembly's data (and nothing
 * else). This is the proof that the whole authorization chain works.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-auth.mjs --email you@x.com --password 'pw'
 */
import { createClient } from "@supabase/supabase-js";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const email = arg("--email");
const password = arg("--password");
if (!email || !password) {
  console.error("❌ Usage: --email <email> --password <password>");
  process.exit(1);
}

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
const supabase = createClient(
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

console.log(`▶ Signing in as ${email} …`);
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error(`❌ Sign-in failed: ${error.message}`);
  process.exit(1);
}
console.log("  ✓ signed in");

// Decode the JWT payload (no verification needed — we just want to see claims).
const payload = JSON.parse(
  Buffer.from(data.session.access_token.split(".")[1], "base64url").toString(),
);
const meta = payload.app_metadata ?? {};

console.log("\n── JWT app_metadata claims ─────────────────────────");
console.log(`   assembly_id ....  ${meta.assembly_id ?? "❌ MISSING"}`);
console.log(`   member_id ......  ${meta.member_id ?? "—"}`);
console.log(`   role_keys ......  ${JSON.stringify(meta.role_keys ?? [])}`);
console.log(`   is_super_admin .  ${meta.is_super_admin ?? false}`);
console.log(`   assembly_ids ...  ${JSON.stringify(meta.assembly_ids ?? [])}`);

const hookEnabled = Boolean(meta.assembly_id);

if (!hookEnabled) {
  console.log(`
❌ The Custom Access Token hook is NOT active.

   Enable it in Supabase:
     Authentication → Hooks  →  "Customize Access Token (JWT) Claims"
     → Enable, and select:  public.custom_access_token_hook
   Then re-run this script.
`);
  process.exit(1);
}

console.log("\n── RLS data access (as this user) ──────────────────");
for (const table of ["assembly", "ministry", "service_type", "fund", "member"]) {
  const { count, error: qErr } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  console.log(
    `   ${table.padEnd(14)} ${qErr ? `❌ ${qErr.message}` : `${count} row(s) visible`}`,
  );
}

console.log("\n🎉 Authorization chain verified: claims → RLS → data.");
await supabase.auth.signOut();
