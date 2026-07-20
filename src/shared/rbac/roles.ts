/**
 * The 14 system roles. Keys match docs/schema/96_seed_rbac.sql and
 * docs/09-permission-matrix.md. Lower rank = higher authority.
 */
export const ROLES = [
  { key: "super_admin", name: "Super Administrator", rank: 10 },
  { key: "district_pastor", name: "District Pastor", rank: 20 },
  { key: "presiding_elder", name: "Presiding Elder", rank: 30 },
  { key: "elder", name: "Elder", rank: 40 },
  { key: "deacon", name: "Deacon", rank: 50 },
  { key: "deaconess", name: "Deaconess", rank: 50 },
  { key: "secretary", name: "Secretary", rank: 55 },
  { key: "financial_secretary", name: "Financial Secretary", rank: 55 },
  { key: "ministry_leader", name: "Ministry Leader", rank: 60 },
  { key: "home_cell_leader", name: "Home Cell Leader", rank: 60 },
  { key: "media_team", name: "Media Team", rank: 70 },
  { key: "church_worker", name: "Church Worker", rank: 80 },
  { key: "member", name: "Member", rank: 90 },
  { key: "auditor", name: "Read-only Auditor", rank: 100 },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];

export function isRoleKey(value: string): value is RoleKey {
  return ROLES.some((r) => r.key === value);
}
