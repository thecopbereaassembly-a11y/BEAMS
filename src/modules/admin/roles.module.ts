import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";

/**
 * Roles & Permissions editor (docs/09).
 *
 * Grants live in `role_permission`, resolved live by RLS (`auth_has_permission`)
 * on every request — so a change here takes effect immediately, no redeploy or
 * re-login. Edits are written as PER-ASSEMBLY OVERRIDES (assembly_id set), which
 * win over the global defaults; Berea can shape a role without affecting other
 * assemblies.
 *
 * Uses the service role after an explicit `role.manage` check (role_permission's
 * RLS is super-admin-only for writes, and this must also work if role.manage is
 * ever delegated).
 */

export interface RolePermission {
  key: string;
  action: string;
  description: string | null;
  isSensitive: boolean;
  granted: boolean;
}

export interface PermissionModule {
  module: string;
  permissions: RolePermission[];
}

export interface EditableRole {
  key: string;
  name: string;
  editable: boolean; // super_admin bypasses the matrix, so it's read-only
}

export async function listRoles(ctx: AuthContext): Promise<Result<EditableRole[]>> {
  requirePermission(ctx, "role.manage");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("role")
    .select("key, name, rank")
    .order("rank");
  if (error) throw new Error(`Failed to load roles: ${error.message}`);
  return ok(
    (data ?? []).map((r) => ({
      key: r.key,
      name: r.name,
      editable: r.key !== "super_admin",
    })),
  );
}

export async function getRoleMatrix(
  ctx: AuthContext,
  roleKey: string,
): Promise<Result<PermissionModule[]>> {
  requirePermission(ctx, "role.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const admin = createAdminClient();

  const { data: role } = await admin.from("role").select("id").eq("key", roleKey).maybeSingle();
  if (!role) return err(AppError.notFound("Role not found"));

  const [{ data: permissions }, { data: grants }] = await Promise.all([
    admin.from("permission").select("id, key, module, action, description, is_sensitive").order("module"),
    admin
      .from("role_permission")
      .select("permission_id, assembly_id, is_granted")
      .eq("role_id", role.id)
      .or(`assembly_id.eq.${ctx.assemblyId},assembly_id.is.null`),
  ]);

  // Effective grant: this assembly's override wins over the global default.
  const globalGrant = new Map<string, boolean>();
  const overrideGrant = new Map<string, boolean>();
  for (const g of grants ?? []) {
    (g.assembly_id ? overrideGrant : globalGrant).set(g.permission_id, g.is_granted);
  }
  const effective = (permissionId: string) =>
    overrideGrant.has(permissionId)
      ? overrideGrant.get(permissionId)!
      : (globalGrant.get(permissionId) ?? false);

  const byModule = new Map<string, RolePermission[]>();
  for (const p of permissions ?? []) {
    const list = byModule.get(p.module) ?? [];
    list.push({
      key: p.key,
      action: p.action,
      description: p.description,
      isSensitive: p.is_sensitive,
      granted: effective(p.id),
    });
    byModule.set(p.module, list);
  }

  return ok(
    [...byModule.entries()]
      .map(([module, perms]) => ({ module, permissions: perms }))
      .sort((a, b) => a.module.localeCompare(b.module)),
  );
}

/**
 * Saves the full matrix for a role in this assembly. Every permission is written
 * as an override reflecting the submitted checkboxes, so the saved state is
 * exactly what the admin sees.
 */
export async function setRoleMatrix(
  ctx: AuthContext,
  roleKey: string,
  grantedKeys: string[],
): Promise<Result<{ changed: number }>> {
  requirePermission(ctx, "role.manage");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  if (roleKey === "super_admin") {
    return err(new AppError("validation", "The Super Administrator role cannot be edited — it always has full access."));
  }

  const admin = createAdminClient();
  const { data: role } = await admin.from("role").select("id").eq("key", roleKey).maybeSingle();
  if (!role) return err(AppError.notFound("Role not found"));

  const { data: permissions } = await admin.from("permission").select("id, key");
  if (!permissions?.length) return ok({ changed: 0 });

  const granted = new Set(grantedKeys);
  const rows = permissions.map((p) => ({
    role_id: role.id,
    permission_id: p.id,
    assembly_id: ctx.assemblyId as string,
    is_granted: granted.has(p.key),
  }));

  const { error } = await admin
    .from("role_permission")
    .upsert(rows, { onConflict: "role_id,permission_id,assembly_id" });
  if (error) throw new Error(`Failed to save permissions: ${error.message}`);

  return ok({ changed: rows.length });
}
