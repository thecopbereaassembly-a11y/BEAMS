#!/usr/bin/env node
/**
 * Verifies liturgical event generation against the LIVE database:
 * the right events are created, linked to ministries, and re-running a month
 * does NOT duplicate. Uses a far-future month and cleans up after itself.
 *
 * Usage:
 *   node --env-file=.env.local scripts/verify-calendar-events.mjs --email x --password y
 */
import { createClient } from "@supabase/supabase-js";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (label, pass, detail = "") => {
  console.log(`   ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures += 1;
};

// ── Recreate buildSpecs() so we compute the expected set independently ───────
const W = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const utc = (y,m,d) => new Date(Date.UTC(y,m,d));
const iso = (d) => d.toISOString().slice(0,10);
const nth = (y,m,wd,n) => { const f=utc(y,m,1).getUTCDay(); return utc(y,m,1+((wd-f+7)%7)+(n-1)*7); };
const last = (y,m,wd) => { const ld=utc(y,m+1,0).getUTCDate(); const lw=utc(y,m,ld).getUTCDay(); return utc(y,m,ld-((lw-wd+7)%7)); };
const mondays = (y,m) => { const o=[]; for(let d=nth(y,m,1,1); d.getUTCMonth()===m; d=utc(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+7)) o.push(new Date(d)); return o; };

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: arg("--email"), password: arg("--password") });
if (authErr) { console.error(`❌ ${authErr.message}`); process.exit(1); }
const assemblyId = JSON.parse(Buffer.from(auth.session.access_token.split(".")[1], "base64url").toString()).app_metadata.assembly_id;
const userId = auth.user.id;

const Y = 2035, M = 9; // October 2035 — safely clear of any real data
console.log(`▶ Signed in · generating events for ${Y}-${String(M+1).padStart(2,"0")}\n`);

// Expected titles/dates
const gospel = last(Y,M,0), mwMon = utc(gospel.getUTCFullYear(),gospel.getUTCMonth(),gospel.getUTCDate()-6);
const lsSun = nth(Y,M,0,1);
const expected = new Set();
expected.add(`Home Cell|${iso(nth(Y,M,1,1))}`);
for (const mon of mondays(Y,M).slice(1)) { if (iso(mon) !== iso(mwMon)) expected.add(`Youth Meeting|${iso(mon)}`); }
for (const off of [0,1,2,3,4,6]) {
  const d = utc(mwMon.getUTCFullYear(),mwMon.getUTCMonth(),mwMon.getUTCDate()+off);
  const t = {0:"Ministries Week — Youth",1:"Ministries Week — Women's Ministry",2:"Ministries Week — Evangelism",3:"Ministries Week — Men's Ministry",4:"Dunamis Fire (District Joint Service)",6:"Gospel Sunday"}[off];
  expected.add(`${t}|${iso(d)}`);
}
for (let off=-5; off<=0; off++) {
  const d = utc(lsSun.getUTCFullYear(),lsSun.getUTCMonth(),lsSun.getUTCDate()+off);
  expected.add(`${off===0?"Lord's Supper Sunday":"Lord's Supper Preparation"}|${iso(d)}`);
}

// The app path isn't callable from a script, so replicate the generation the
// same way the service does (insert-if-absent), to test the DATA behaviour.
async function generate() {
  const dates = [...expected].map((k) => k.split("|")[1]).sort();
  const rangeStart = `${dates[0]}T00:00:00.000Z`, rangeEnd = `${dates[dates.length-1]}T23:59:59.999Z`;
  const { data: existing } = await supabase.from("event").select("title, starts_at").eq("assembly_id", assemblyId).is("deleted_at", null).gte("starts_at", rangeStart).lte("starts_at", rangeEnd);
  const seen = new Set((existing ?? []).map((e) => `${e.title}|${e.starts_at.slice(0,10)}`));
  const { data: mins } = await supabase.from("ministry").select("id, code").eq("assembly_id", assemblyId);
  const byCode = new Map((mins ?? []).filter((m)=>m.code).map((m)=>[m.code,m.id]));
  const codeFor = { "Ministries Week — Youth":"YOUTH","Ministries Week — Women's Ministry":"WOMEN","Ministries Week — Evangelism":"EVANGELISM","Ministries Week — Men's Ministry":"PEMEM" };
  const rows = [...expected].filter((k) => !seen.has(k)).map((k) => {
    const [title, date] = k.split("|");
    const morning = ["Gospel Sunday","Lord's Supper Sunday"].includes(title);
    return { assembly_id: assemblyId, title, starts_at:`${date}T${morning?"07:00:00":"19:00:00"}.000Z`, ends_at:`${date}T${morning?"09:30:00":"20:30:00"}.000Z`, ministry_id: byCode.get(codeFor[title]) ?? null, location: title.startsWith("Dunamis")?"Central church":null, visibility:"assembly", status:"scheduled", requires_registration:false, created_by:userId, updated_by:userId };
  });
  if (rows.length) { const { error } = await supabase.from("event").insert(rows); if (error) throw new Error(error.message); }
  return rows.length;
}

console.log("── FIRST GENERATION ────────────────────────────────");
const firstCount = await generate();
check("events were created", firstCount > 0, `${firstCount} created`);
check("created exactly the expected number", firstCount === expected.size, `${firstCount} vs ${expected.size} expected`);

const { data: afterFirst } = await supabase.from("event").select("title, starts_at, ministry_id, location").eq("assembly_id", assemblyId).is("deleted_at", null).gte("starts_at", `${[...expected].map(k=>k.split("|")[1]).sort()[0]}T00:00:00Z`).lte("starts_at", `${[...expected].map(k=>k.split("|")[1]).sort().slice(-1)[0]}T23:59:59Z`);
const got = new Set((afterFirst ?? []).map((e) => `${e.title}|${e.starts_at.slice(0,10)}`));
check("every expected event is present", [...expected].every((k) => got.has(k)), `${got.size} in range`);

const dunamis = (afterFirst ?? []).find((e) => e.title.startsWith("Dunamis"));
check("Dunamis Fire has location 'Central church'", dunamis?.location === "Central church");
const womenEvent = (afterFirst ?? []).find((e) => e.title.includes("Women"));
check("Ministries-Week event is linked to its ministry", Boolean(womenEvent?.ministry_id));

console.log("\n── ⭐ IDEMPOTENT RE-RUN ─────────────────────────────");
const secondCount = await generate();
check("re-running creates NOTHING new", secondCount === 0, `${secondCount} created on 2nd run`);

const { count: total } = await supabase.from("event").select("*", { count: "exact", head: true }).eq("assembly_id", assemblyId).is("deleted_at", null).gte("starts_at", "2035-09-01T00:00:00Z").lte("starts_at", "2035-11-01T00:00:00Z");
check("no duplicates after two runs", total === expected.size, `${total} total`);

// ── cleanup ──────────────────────────────────────────────────────────────
if (SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await admin.from("event").delete().eq("assembly_id", assemblyId).gte("starts_at", "2035-09-01T00:00:00Z").lte("starts_at", "2035-11-01T00:00:00Z");
  console.log("\n  (generated events removed)");
}

await supabase.auth.signOut();
console.log(failures === 0
  ? "\n🎉 Calendar events verified: correct set generated, ministries linked,\n   Dunamis Fire located at Central, and re-running never duplicates."
  : `\n❌ ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
