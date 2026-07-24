import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS, type Permission, isPermission } from "@/shared/rbac/permissions";
import type { AuthContext } from "@/shared/rbac/can";

/**
 * Builds the request's AuthContext from JWT claims + the LIVE permission matrix.
 *
 * Permissions are deliberately not baked into the token (docs/09 §5) — they are
 * resolved from role_permission on each request, so an admin's change to a
 * role's permissions takes effect immediately, with no redeploy or re-login.
 *
 * `cache()` de-duplicates this within a single request/render pass.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();

  // IMPORTANT: read the CLAIMS, not getUser().app_metadata.
  //
  // The Custom Access Token hook injects assembly_id / role_keys / etc. into the
  // JWT. getUser() returns the user's STORED app_metadata (just provider info),
  // which does NOT contain the hook claims — so reading it left every user with
  // "No assembly". getClaims() verifies the token and returns its payload, where
  // the hook claims actually live.
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (error || !claims?.sub) return null;

  const userId = claims.sub;
  const meta = (claims.app_metadata ?? {}) as {
    assembly_id?: string | null;
    member_id?: string | null;
    role_keys?: string[];
    is_super_admin?: boolean;
  };

  const assemblyId = meta.assembly_id ?? null;
  const isSuperAdmin = meta.is_super_admin === true;

  // Super admins hold every permission — no need to query.
  if (isSuperAdmin) {
    return {
      userId,
      assemblyId,
      memberId: meta.member_id ?? null,
      roleKeys: meta.role_keys ?? [],
      isSuperAdmin: true,
      permissions: new Set<Permission>(PERMISSIONS),
    };
  }

  const permissions = new Set<Permission>();

  if (assemblyId) {
    // 1. Roles held in the active assembly (RLS restricts this to own rows).
    const { data: assignments } = await supabase
      .from("user_assembly_role")
      .select("role_id")
      .eq("app_user_id", userId)
      .eq("assembly_id", assemblyId)
      .eq("is_active", true)
      .is("deleted_at", null);

    const roleIds = (assignments ?? []).map((a) => a.role_id);

    if (roleIds.length > 0) {
      // 2. Granted permission ids for those roles (global default or this
      //    assembly's override).
      const { data: grants } = await supabase
        .from("role_permission")
        .select("permission_id, assembly_id")
        .in("role_id", roleIds)
        .eq("is_granted", true)
        .or(`assembly_id.eq.${assemblyId},assembly_id.is.null`);

      const permissionIds = [...new Set((grants ?? []).map((g) => g.permission_id))];

      if (permissionIds.length > 0) {
        // 3. Resolve ids → keys.
        const { data: perms } = await supabase
          .from("permission")
          .select("key")
          .in("id", permissionIds);

        for (const p of perms ?? []) {
          if (isPermission(p.key)) permissions.add(p.key);
        }
      }
    }
  }

  return {
    userId,
    assemblyId,
    memberId: meta.member_id ?? null,
    roleKeys: meta.role_keys ?? [],
    isSuperAdmin: false,
    permissions,
  };
});

/** Throws if unauthenticated — for use in server actions/route handlers. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new Error("Unauthorized");
  return ctx;
}
