import { z } from "zod";

/**
 * Attendance validation. Supports BOTH capture modes (docs/05 §6):
 *  · roster    — one record per person (attendance_record)
 *  · headcount — aggregate counts per category (attendance_count), for large
 *                services where per-person capture is impractical
 */

export const ATTENDANCE_STATUSES = ["present", "absent", "excused", "late"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const HEADCOUNT_CATEGORIES = [
  "men",
  "women",
  "youth",
  "children",
  "visitors",
] as const;

export const SESSION_STATUSES = ["scheduled", "open", "closed", "cancelled"] as const;

export const sessionFormSchema = z.object({
  service_type_id: z.string().uuid("Select a service type"),
  service_date: z
    .string()
    .trim()
    .min(1, "Service date is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  title: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type SessionFormValues = z.output<typeof sessionFormSchema>;

/**
 * A single attendance mark. `client_uuid` is the IDEMPOTENCY KEY: generated on
 * the device before the write, so replaying a queued mark after reconnect can
 * never double-post (docs/07 §4, docs/13 §A3).
 */
export const attendanceMarkSchema = z.object({
  session_id: z.string().uuid(),
  member_id: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  client_uuid: z.string().uuid(),
  captured_offline: z.boolean().default(false),
});

export type AttendanceMark = z.output<typeof attendanceMarkSchema>;

/** A batch of marks flushed from the offline queue. */
export const attendanceBatchSchema = z.object({
  marks: z.array(attendanceMarkSchema).min(1).max(500),
});

export const headcountSchema = z.object({
  session_id: z.string().uuid(),
  category: z.enum(HEADCOUNT_CATEGORIES),
  headcount: z.coerce.number().int().min(0, "Cannot be negative"),
});

export type HeadcountValues = z.output<typeof headcountSchema>;

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  excused: "Excused",
  late: "Late",
};

export const CATEGORY_LABELS: Record<(typeof HEADCOUNT_CATEGORIES)[number], string> = {
  men: "Men",
  women: "Women",
  youth: "Youth",
  children: "Children",
  visitors: "Visitors",
};
