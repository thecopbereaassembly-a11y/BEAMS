import { describe, it, expect } from "vitest";
import { can, canAll, requirePermission, ForbiddenError, type AuthContext } from "./can";
import type { Permission } from "./permissions";

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    assemblyId: "a1",
    memberId: null,
    roleKeys: ["home_cell_leader"],
    isSuperAdmin: false,
    permissions: new Set<Permission>(["homecell.write", "attendance.write"]),
    ...overrides,
  };
}

describe("rbac/can", () => {
  it("grants a held permission", () => {
    expect(can(ctx(), "homecell.write")).toBe(true);
  });

  it("denies a permission not held", () => {
    expect(can(ctx(), "finance.write")).toBe(false);
  });

  it("super admin bypasses all checks", () => {
    const admin = ctx({ isSuperAdmin: true, permissions: new Set() });
    expect(can(admin, "finance.write")).toBe(true);
    expect(can(admin, "counselling.read")).toBe(true);
  });

  it("canAll requires every permission", () => {
    expect(canAll(ctx(), ["homecell.write", "attendance.write"])).toBe(true);
    expect(canAll(ctx(), ["homecell.write", "finance.write"])).toBe(false);
  });

  it("requirePermission throws ForbiddenError when missing", () => {
    expect(() => requirePermission(ctx(), "finance.write")).toThrow(ForbiddenError);
    expect(() => requirePermission(ctx(), "homecell.write")).not.toThrow();
  });
});
