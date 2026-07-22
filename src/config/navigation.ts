import type { Permission } from "@/shared/rbac/permissions";

export interface NavItem {
  label: string;
  href: string;
  /** Hidden unless the user holds this permission (docs/09). */
  permission?: Permission;
  /** Not yet implemented — shown muted. */
  planned?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Sidebar navigation. Rendered server-side and filtered by permission, so a
 * user never sees a module they cannot open. RLS remains the real guarantee —
 * this is UX (docs/08 §4).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", permission: "dashboard.view" }],
  },
  {
    title: "People",
    items: [
      { label: "Members", href: "/members", permission: "member.read" },
      { label: "Families", href: "/families", permission: "family.read", planned: true },
      { label: "Home Cells", href: "/home-cells", permission: "homecell.read" },
      { label: "Ministries", href: "/ministries", permission: "ministry.read" },
      { label: "Leadership", href: "/leadership", permission: "leadership.read" },
      { label: "Visitors", href: "/visitors", permission: "visitor.read", planned: true },
    ],
  },
  {
    title: "Ministry",
    items: [
      { label: "Attendance", href: "/attendance", permission: "attendance.read" },
      { label: "Shepherding", href: "/shepherding", permission: "shepherding.read", planned: true },
      { label: "Counselling", href: "/counselling", permission: "counselling.read", planned: true },
      { label: "Welfare", href: "/welfare", permission: "welfare.read", planned: true },
      { label: "Prayer", href: "/prayer-requests", permission: "prayer.read", planned: true },
      { label: "Evangelism", href: "/evangelism", permission: "evangelism.read", planned: true },
      { label: "Events", href: "/events", permission: "event.read", planned: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Finance", href: "/finance", permission: "finance.read", planned: true },
      { label: "Communication", href: "/communication", permission: "communication.read", planned: true },
      { label: "Documents", href: "/documents", permission: "document.read", planned: true },
      { label: "Assets", href: "/assets", permission: "asset.read", planned: true },
      { label: "Reports", href: "/reports", permission: "report.read" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/admin/users", permission: "user.manage", planned: true },
      { label: "Roles & Permissions", href: "/admin/roles", permission: "role.manage", planned: true },
      { label: "Activity Logs", href: "/activity-logs", permission: "audit.read", planned: true },
      { label: "Settings", href: "/settings", permission: "settings.read", planned: true },
    ],
  },
];
