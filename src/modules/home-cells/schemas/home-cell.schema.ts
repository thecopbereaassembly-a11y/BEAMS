import { z } from "zod";

/**
 * Home Cell validation. The Home Cell (CoP Bacenta-style) is the primary unit
 * of shepherding and weekly attendance (docs/04 §4).
 */

export const MEETING_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const CELL_ROLES = ["leader", "assistant", "member"] as const;

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || z.string().uuid().safeParse(v).success,
    "Invalid selection",
  );

export const homeCellFormSchema = z.object({
  name: z.string().trim().min(1, "Cell name is required").max(120),
  code: optionalText,
  leader_member_id: optionalUuid,
  assistant_member_id: optionalUuid,
  meeting_day: z.enum(MEETING_DAYS).optional(),
  meeting_time: optionalText,
  location: optionalText,
  gps_address: optionalText,
  is_active: z.coerce.boolean().default(true),
});

export type HomeCellFormValues = z.output<typeof homeCellFormSchema>;

export const homeCellListQuerySchema = z.object({
  q: z.string().trim().optional(),
  active: z.enum(["all", "active", "inactive"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type HomeCellListQuery = z.output<typeof homeCellListQuerySchema>;

/** Add an existing member to a cell. */
export const cellMemberSchema = z.object({
  member_id: z.string().uuid("Select a member"),
  role: z.enum(CELL_ROLES).default("member"),
});

/**
 * The weekly Home Cell report — attendance, offering, and pastoral notes that
 * feed the dashboard and the district roll-up (docs/04 §4).
 */
export const cellReportSchema = z.object({
  report_date: z
    .string()
    .trim()
    .min(1, "Report date is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  attendance_count: z.coerce.number().int().min(0, "Cannot be negative").default(0),
  visitors_count: z.coerce.number().int().min(0, "Cannot be negative").default(0),
  offering_amount: z.coerce.number().min(0, "Cannot be negative").default(0),
  testimonies: optionalText,
  prayer_points: optionalText,
  absentees_note: optionalText,
  followups_note: optionalText,
});

export type CellReportValues = z.output<typeof cellReportSchema>;

export const ROLE_LABELS: Record<(typeof CELL_ROLES)[number], string> = {
  leader: "Leader",
  assistant: "Assistant",
  member: "Member",
};
