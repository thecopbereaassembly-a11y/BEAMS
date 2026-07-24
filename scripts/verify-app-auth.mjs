#!/usr/bin/env node
/**
 * Verifies the RUNNING APP's auth path — not just RLS.
 *
 * This is the check that was missing: every other verify-*.mjs talks to Supabase
 * directly, so they proved RLS/JWT worked but NOT that the Next.js app reads the
 * claims correctly. The "No assembly" bug (getAuthContext read
 * getUser().app_metadata, which lacks the hook claims) slipped through precisely
 * because nothing rendered a real authenticated page.
 *
 * It logs in, builds the same @supabase/ssr session cookie the browser gets,
 * fetches /dashboard over HTTP, and asserts the assembly + nav actually render.
 *
 * The dev or prod server must be running.
 * Usage:
 *   node --env-file=.env.local scripts/verify-app-auth.mjs \
 *     --email x@y.com --password 'pw' [--url http://localhost:3100]
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const arg = (f, d = null) => {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const url = arg("--url", "http://localhost:3100");
const email = arg("--email");
const password = arg("--password");
if (!email || !password) {
  console.error("❌ Usage: --email <email> --password <password> [--url <appUrl>]");
  process.exit(1);
}

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

// 1. Real session
const plain = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: authErr } = await plain.auth.signInWithPassword({ email, password });
if (authErr) {
  console.error(`❌ Sign-in failed: ${authErr.message}`);
  process.exit(1);
}

// 2. The browser's exact cookie, produced by @supabase/ssr
const jar = new Map();
const ssr = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
  },
});
await ssr.auth.setSession({
  access_token: auth.session.access_token,
  refresh_token: auth.session.refresh_token,
});
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");

console.log(`▶ Fetching ${url}/dashboard as a signed-in user\n`);

let html = "";
let status = 0;
try {
  const res = await fetch(`${url}/dashboard`, { headers: { cookie }, redirect: "manual" });
  status = res.status;
  html = await res.text();
} catch (error) {
  console.error(`❌ Could not reach ${url} — is the server running?\n   ${error.message}`);
  process.exit(1);
}

check("dashboard returns 200 (not a redirect to login)", status === 200, `HTTP ${status}`);
check("renders the assembly name", html.includes("Berea English Assembly"));
check("does NOT show 'No assembly'", !html.includes("No assembly"));
check("does NOT show 'not linked to an assembly'", !html.includes("not linked to an assembly"));
check("navigation is present (Members)", html.includes("Members"));
check("navigation is present (Finance)", html.includes("Finance"));

await plain.auth.signOut();
console.log(
  failures === 0
    ? "\n🎉 The running app reads auth claims correctly — assembly and navigation render."
    : `\n❌ ${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
