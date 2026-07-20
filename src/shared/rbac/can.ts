import type { Permission } from "./permissions";

/**
 * The authenticated user's authorization context, derived from JWT claims
 * (docs/08 §2). `permissions` is resolved from the DB matrix at request time,
 * so runtime role changes take effect immediately.
 */
export interface AuthContext {
  userId: string;
  assemblyId: string | null;
  memberId: string | null;
  roleKeys: string[];
  isSuperAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

/**
 * App-layer authorization guard — mirrors the RLS `auth_has_permission()` check
 * (docs/09 §5). This is defense-in-depth + UX (hide controls, clean 403s); the
 * database RLS remains the actual guarantee.
 */
export function can(ctx: AuthContext, permission: Permission): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.permissions.has(permission);
}

export function canAny(ctx: AuthContext, permissions: Permission[]): boolean {
  return ctx.isSuperAdmin || permissions.some((p) => ctx.permissions.has(p));
}

export function canAll(ctx: AuthContext, permissions: Permission[]): boolean {
  return ctx.isSuperAdmin || permissions.every((p) => ctx.permissions.has(p));
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}

/** Throw a ForbiddenError (→ 403 envelope) if the permission is absent. */
export function requirePermission(
  ctx: AuthContext,
  permission: Permission,
): void {
  if (!can(ctx, permission)) throw new ForbiddenError(permission);
}
