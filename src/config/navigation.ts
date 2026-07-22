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
      { label: "Visitors", href: "/visitors", permission: "visitor.read" },
    ],
  },
  {
    title: "Ministry",
    items: [
      { label: "Attendance", href: "/attendance", permission: "attendance.read" },
      { label: "Shepherding", href: "/shepherding", permission: "shepherding.read" },
      { label: "Counselling", href: "/counselling", permission: "counselling.read" },
      { label: "Welfare", href: "/welfare", permission: "welfare.read" },
      { label: "Prayer", href: "/prayer-requests", permission: "prayer.read" },
      { label: "Evangelism", href: "/evangelism", permission: "evangelism.read" },
      { label: "Events", href: "/events", permission: "event.read" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Finance", href: "/finance", permission: "finance.read" },
      { label: "Communication", href: "/communication", permission: "communication.read" },
      { label: "Documents", href: "/documents", permission: "document.read" },
      { label: "Assets", href: "/assets", permission: "asset.read" },
      { label: "Reports", href: "/reports", permission: "report.read" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/admin/users", permission: "user.manage", planned: true },
      { label: "Roles & Permissions", href: "/admin/roles", permission: "role.manage", planned: true },
      { label: "Activity Logs", href: "/activity-logs", permission: "audit.read" },
      { label: "Settings", href: "/settings", permission: "settings.read", planned: true },
    ],
  },
];
