import type { Permission } from "@/shared/rbac/permissions";

/**
 * The report catalog. Each report declares the permission it needs and the
 * columns it produces; the runner and every export format read from the same
 * definition, so a new report is one entry plus one query (docs/04 §19).
 */
export interface ReportColumn {
  key: string;
  label: string;
  /** Right-align and use tabular figures. */
  numeric?: boolean;
}

export interface ReportDefinition {
  key: string;
  name: string;
  description: string;
  module: string;
  permission: Permission;
  columns: ReportColumn[];
}

export const REPORTS: ReportDefinition[] = [
  {
    key: "members",
    name: "Member register",
    description: "Every active member with contact details and status.",
    module: "Membership",
    permission: "member.read",
    columns: [
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "gender", label: "Gender" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "home_cell", label: "Home cell" },
      { key: "joined_on", label: "Joined" },
      { key: "water_baptized", label: "Water baptism" },
      { key: "holy_spirit_baptized", label: "Holy Spirit baptism" },
    ],
  },
  {
    key: "birthdays",
    name: "Birthdays",
    description: "Members' birthdays through the year, earliest first.",
    module: "Membership",
    permission: "member.read",
    columns: [
      { key: "name", label: "Name" },
      { key: "date", label: "Birthday" },
      { key: "age", label: "Age", numeric: true },
      { key: "phone", label: "Phone" },
    ],
  },
  {
    key: "attendance",
    name: "Attendance by service",
    description: "Every session with present, absent and total counts.",
    module: "Attendance",
    permission: "attendance.read",
    columns: [
      { key: "date", label: "Date" },
      { key: "service", label: "Service" },
      { key: "present", label: "Present", numeric: true },
      { key: "absent", label: "Absent", numeric: true },
      { key: "marked", label: "Total marked", numeric: true },
    ],
  },
  {
    key: "home-cells",
    name: "Home cell summary",
    description: "Each cell with its leader, schedule and roster size.",
    module: "Home Cells",
    permission: "homecell.read",
    columns: [
      { key: "name", label: "Cell" },
      { key: "code", label: "Code" },
      { key: "members", label: "Members", numeric: true },
      { key: "meeting", label: "Meets" },
      { key: "location", label: "Location" },
      { key: "active", label: "Active" },
    ],
  },
  {
    key: "cell-reports",
    name: "Home cell reports",
    description: "Weekly cell reports: attendance, visitors and offering.",
    module: "Home Cells",
    permission: "homecell.read",
    columns: [
      { key: "date", label: "Date" },
      { key: "cell", label: "Cell" },
      { key: "attendance", label: "Attendance", numeric: true },
      { key: "visitors", label: "Visitors", numeric: true },
      { key: "offering", label: "Offering (GHS)", numeric: true },
    ],
  },
  {
    key: "ministries",
    name: "Ministry summary",
    description: "Ministries and movements with membership counts.",
    module: "Ministries",
    permission: "ministry.read",
    columns: [
      { key: "name", label: "Ministry" },
      { key: "code", label: "Code" },
      { key: "category", label: "Type" },
      { key: "members", label: "Members", numeric: true },
      { key: "active", label: "Active" },
    ],
  },
  {
    key: "leadership",
    name: "Leadership roster",
    description: "Current officers by office, with appointment dates.",
    module: "Leadership",
    permission: "leadership.read",
    columns: [
      { key: "name", label: "Name" },
      { key: "office", label: "Office" },
      { key: "portfolio", label: "Portfolio" },
      { key: "appointed_on", label: "Appointed" },
      { key: "ordained_on", label: "Ordained" },
    ],
  },
];

export function findReport(key: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.key === key);
}
