#!/usr/bin/env node
/**
 * Fully removes a user created by bootstrap-admin.mjs: auth user, app_user
 * profile, linked member record, role assignments, and any audit rows that
 * captured their details.
 *
 * Usage:
 *   node --env-file=.env.local scripts/remove-user.mjs --email someone@example.com
 */
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : null;
};

const email = arg("--email");
if (!email) {
  console.error("❌ Usage: --email <email>");
  process.exit(1);
}

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } =
  process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

try {
  const { rows } = await db.query(
    "select id, member_id from app_user where lower(email) = lower($1)",
    [email],
  );

  if (rows.length === 0) {
    console.log("  no app_user row found for that email");
  }

  for (const { id: userId, member_id: memberId } of rows) {
    await db.query("begin");
    // Audit rows capturing this person (triggers wrote these on insert).
    await db.query(
      `delete from activity_log
        where actor_user_id = $1
           or (entity_type = 'member'   and entity_id = $2)
           or (entity_type = 'app_user' and entity_id = $1)`,
      [userId, memberId],
    );
    await db.query("delete from user_assembly_role where app_user_id = $1", [userId]);
    await db.query("update app_user set member_id = null where id = $1", [userId]);
    if (memberId) {
      await db.query("delete from membership_status_history where member_id = $1", [memberId]);
      await db.query("delete from member where id = $1", [memberId]);
    }
    await db.query("delete from app_user where id = $1", [userId]);
    await db.query("commit");
    console.log(`  ✓ removed app_user ${userId} and member ${memberId ?? "—"}`);

    const { error } = await admin.auth.admin.deleteUser(userId);
    console.log(
      error ? `  ⚠ auth user delete: ${error.message}` : "  ✓ removed auth user",
    );
  }

  // Belt and braces: any member row carrying that email.
  const stray = await db.query(
    "delete from member where lower(primary_email) = lower($1) returning id",
    [email],
  );
  if (stray.rowCount) console.log(`  ✓ removed ${stray.rowCount} stray member row(s)`);

  const { rows: check } = await db.query(
    `select (select count(*) from app_user where lower(email)=lower($1)) as app_users,
            (select count(*) from member   where lower(primary_email)=lower($1)) as members,
            (select count(*) from activity_log where after_data::text ilike '%'||$1||'%') as audit_rows`,
    [email],
  );
  console.log("\n── Remaining traces ──");
  console.table(check);
} catch (error) {
  await db.query("rollback").catch(() => {});
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
