/**
 * Canonical permission catalog — the source of truth for the app layer.
 * MUST stay in sync with docs/schema/96_seed_rbac.sql (the DB matrix RLS reads).
 * See docs/09-permission-matrix.md.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "member.read",
  "member.write",
  "member.delete",
  "member.export",
  "family.read",
  "family.write",
  "homecell.read",
  "homecell.write",
  "ministry.read",
  "ministry.write",
  "leadership.read",
  "leadership.write",
  "visitor.read",
  "visitor.write",
  "attendance.read",
  "attendance.write",
  "shepherding.read",
  "shepherding.write",
  "counselling.read",
  "counselling.write",
  "welfare.read",
  "welfare.write",
  "evangelism.read",
  "evangelism.write",
  "event.read",
  "event.write",
  "prayer.read",
  "prayer.write",
  "finance.read",
  "finance.write",
  "finance.export",
  "communication.read",
  "communication.write",
  "document.read",
  "document.write",
  "asset.read",
  "asset.write",
  "report.read",
  "report.write",
  "report.export",
  "settings.read",
  "settings.write",
  "user.manage",
  "role.manage",
  "audit.read",
  "assistant.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions on confidential/audit-critical data (extra RLS + audit). */
export const SENSITIVE_PERMISSIONS = new Set<Permission>([
  "counselling.read",
  "counselling.write",
  "welfare.read",
  "welfare.write",
  "finance.read",
  "finance.write",
  "finance.export",
  "user.manage",
  "role.manage",
  "audit.read",
]);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
