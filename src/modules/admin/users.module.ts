import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";

/**
 * User management (docs/04 §21). Uses the SERVICE ROLE after an explicit
 * `user.manage` check, scoped to the active assembly in code — the same
 * "trusted server op behind an app permission" pattern as documents. This is
 * necessary because app_user's RLS only exposes self/super-admin rows, so a
 * Presiding Elder managing users could not list them under RLS alone.
 */

export const createUserSchema = z.object({
  full_name: z.string().trim().min(1, "Enter their name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  // A person can hold several roles at once (e.g. Elder + Ministry Leader).
  role_keys: z.array(z.string().trim().min(1)).min(1, "Choose at least one role"),
});

export type CreateUserValues = z.output<typeof createUserSchema>;

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  is_active: boolean;
  is_super_admin: boolean;
  roles: string[];
  last_login_at: string | null;
}

export interface AssignableRole {
  key: string;
  name: string;
}

export async function listAssignableRoles(ctx: AuthContext): Promise<Result<AssignableRole[]>> {
  requirePermission(ctx, "user.manage");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("role")
    .select("key, name, rank")
    .eq("is_assignable", true)
    .order("rank");
  if (error) throw new Error(`Failed to load roles: ${error.message}`);
  return ok((data ?? []).map((r) => ({ key: r.key, name: r.name })));
}

export async function listUsers(ctx: AuthContext): Promise<Result<UserRow[]>> {
  requirePermission(ctx, "user.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const admin = createAdminClient();

  // Everyone with a role in this assembly.
  const { data: assignments, error } = await admin
    .from("user_assembly_role")
    .select("app_user_id, role_id, is_active")
    .eq("assembly_id", ctx.assemblyId)
    .eq("is_active", true);

  if (error) throw new Error(`Failed to load users: ${error.message}`);
  if (!assignments?.length) return ok([]);

  const userIds = [...new Set(assignments.map((a) => a.app_user_id))];
  const roleIds = [...new Set(assignments.map((a) => a.role_id))];

  const [{ data: users }, { data: roles }] = await Promise.all([
    admin
      .from("app_user")
      .select("id, email, full_name, is_active, is_super_admin, last_login_at")
      .in("id", userIds),
    admin.from("role").select("id, key").in("id", roleIds),
  ]);

  const roleKeyById = new Map((roles ?? []).map((r) => [r.id, r.key]));
  const rolesByUser = new Map<string, string[]>();
  for (const a of assignments) {
    const key = roleKeyById.get(a.role_id);
    if (!key) continue;
    const list = rolesByUser.get(a.app_user_id) ?? [];
    list.push(key);
    rolesByUser.set(a.app_user_id, list);
  }

  return ok(
    (users ?? [])
      .map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        is_active: u.is_active,
        is_super_admin: u.is_super_admin,
        roles: rolesByUser.get(u.id) ?? [],
        last_login_at: u.last_login_at,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  );
}

function tempPassword(): string {
  // Readable, meets policy: word + random + digit + symbol.
  return `Berea-${crypto.randomUUID().slice(0, 8)}!7`;
}

/**
 * Creates a login: auth user + profile + linked member + role assignment.
 *
 * Email delivery isn't configured yet, so we set a temporary password and hand
 * it back to the administrator to pass on — the new user changes it on first
 * sign-in. When an email provider is added, switch to an invite link.
 */
export async function createUser(
  ctx: AuthContext,
  values: CreateUserValues,
): Promise<Result<{ tempPassword: string; reused: boolean }>> {
  requirePermission(ctx, "user.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const admin = createAdminClient();
  const password = tempPassword();

  // 1. Auth user (or find an existing one by email).
  let authUserId: string;
  let reused = false;
  const created = await admin.auth.admin.createUser({
    email: values.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: values.full_name },
  });

  if (created.error) {
    if (!/already/i.test(created.error.message)) {
      throw new Error(`Could not create login: ${created.error.message}`);
    }
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list.users.find(
      (u) => u.email?.toLowerCase() === values.email.toLowerCase(),
    );
    if (!found) return err(new AppError("conflict", "That email already has a login."));
    authUserId = found.id;
    reused = true;
    await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
  } else {
    authUserId = created.data.user.id;
  }

  // 2. Roles must exist (a person can hold several).
  const { data: roles } = await admin
    .from("role")
    .select("id, key")
    .in("key", values.role_keys);
  if (!roles?.length) return err(new AppError("validation", "None of those roles exist."));

  // 3. Link (or create) a member record for this person.
  const parts = values.full_name.trim().split(/\s+/);
  const firstName = parts[0] ?? values.full_name;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName;

  const { data: existingMember } = await admin
    .from("member")
    .select("id")
    .eq("assembly_id", ctx.assemblyId)
    .ilike("primary_email", values.email)
    .is("deleted_at", null)
    .maybeSingle();

  let memberId = existingMember?.id ?? null;
  if (!memberId) {
    const { data: member } = await admin
      .from("member")
      .insert({
        assembly_id: ctx.assemblyId,
        first_name: firstName,
        last_name: lastName,
        primary_email: values.email,
        current_status: "member",
        joined_on: new Date().toISOString().slice(0, 10),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    memberId = member?.id ?? null;
  }

  // 4. Profile.
  await admin.from("app_user").upsert(
    {
      id: authUserId,
      email: values.email,
      full_name: values.full_name,
      member_id: memberId,
      is_active: true,
    },
    { onConflict: "id" },
  );

  // 5. Role assignments in this assembly (one row per role held).
  const { error: roleErr } = await admin.from("user_assembly_role").upsert(
    roles.map((r) => ({
      app_user_id: authUserId,
      assembly_id: ctx.assemblyId as string,
      role_id: r.id,
      is_primary: true, // same assembly on every row; drives active-assembly pick
      is_active: true,
      granted_by: ctx.userId,
    })),
    { onConflict: "app_user_id,assembly_id,role_id" },
  );
  if (roleErr) throw new Error(`Could not assign the roles: ${roleErr.message}`);

  return ok({ tempPassword: password, reused });
}

/** The role keys a user currently holds (active) in this assembly. */
export async function getUserRoles(
  ctx: AuthContext,
  appUserId: string,
): Promise<Result<{ fullName: string; email: string | null; isActive: boolean; roleKeys: string[] }>> {
  requirePermission(ctx, "user.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const admin = createAdminClient();
  const { data: user } = await admin
    .from("app_user")
    .select("full_name, email, is_active")
    .eq("id", appUserId)
    .maybeSingle();
  if (!user) return err(AppError.notFound("User not found"));

  const { data: assignments } = await admin
    .from("user_assembly_role")
    .select("role_id")
    .eq("app_user_id", appUserId)
    .eq("assembly_id", ctx.assemblyId)
    .eq("is_active", true);

  const roleIds = (assignments ?? []).map((a) => a.role_id);
  const { data: roles } = roleIds.length
    ? await admin.from("role").select("key").in("id", roleIds)
    : { data: [] };

  return ok({
    fullName: user.full_name,
    email: user.email,
    isActive: user.is_active,
    roleKeys: (roles ?? []).map((r) => r.key),
  });
}

/**
 * Syncs a user's roles in this assembly to exactly `roleKeys`: activates the
 * ones listed, deactivates the ones removed. Keeps the many-to-many honest.
 */
export async function setUserRoles(
  ctx: AuthContext,
  appUserId: string,
  roleKeys: string[],
): Promise<Result<true>> {
  requirePermission(ctx, "user.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  if (roleKeys.length === 0) {
    return err(new AppError("validation", "A user must keep at least one role."));
  }

  const admin = createAdminClient();

  const { data: allRoles } = await admin.from("role").select("id, key");
  const idByKey = new Map((allRoles ?? []).map((r) => [r.key, r.id]));
  const wantedIds = roleKeys.map((k) => idByKey.get(k)).filter((v): v is string => Boolean(v));
  if (wantedIds.length === 0) return err(new AppError("validation", "No valid roles selected."));

  // Deactivate roles no longer wanted.
  const { data: current } = await admin
    .from("user_assembly_role")
    .select("id, role_id, is_active")
    .eq("app_user_id", appUserId)
    .eq("assembly_id", ctx.assemblyId);

  const wanted = new Set(wantedIds);
  const toDeactivate = (current ?? []).filter((r) => r.is_active && !wanted.has(r.role_id));
  if (toDeactivate.length > 0) {
    await admin
      .from("user_assembly_role")
      .update({ is_active: false })
      .in("id", toDeactivate.map((r) => r.id));
  }

  // Activate / add the wanted roles.
  const { error } = await admin.from("user_assembly_role").upsert(
    wantedIds.map((role_id) => ({
      app_user_id: appUserId,
      assembly_id: ctx.assemblyId as string,
      role_id,
      is_primary: true,
      is_active: true,
      granted_by: ctx.userId,
    })),
    { onConflict: "app_user_id,assembly_id,role_id" },
  );
  if (error) throw new Error(`Could not update roles: ${error.message}`);

  return ok(true);
}

/** Suspend or reactivate a login. An admin cannot lock themselves out. */
export async function setUserActive(
  ctx: AuthContext,
  appUserId: string,
  active: boolean,
): Promise<Result<true>> {
  requirePermission(ctx, "user.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  if (appUserId === ctx.userId) {
    return err(new AppError("validation", "You cannot suspend your own account."));
  }

  const admin = createAdminClient();

  // Confirm the target belongs to this assembly before touching them.
  const { data: belongs } = await admin
    .from("user_assembly_role")
    .select("id")
    .eq("app_user_id", appUserId)
    .eq("assembly_id", ctx.assemblyId)
    .limit(1)
    .maybeSingle();
  if (!belongs) return err(AppError.notFound("User not found in this assembly"));

  const { error } = await admin
    .from("app_user")
    .update({ is_active: active })
    .eq("id", appUserId);
  if (error) throw new Error(`Could not update the user: ${error.message}`);

  // Also block/unblock at the auth layer so a suspended user cannot sign in.
  await admin.auth.admin.updateUserById(appUserId, {
    ban_duration: active ? "none" : "876000h", // ~100 years
  });

  return ok(true);
}
