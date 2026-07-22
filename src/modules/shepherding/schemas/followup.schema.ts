import { z } from "zod";

/**
 * Shepherding — the follow-up engine (docs/04 §9, docs/13 §A4).
 * Follow-ups are raised automatically (absentees, new visitors, new converts)
 * or manually, then assigned, contacted, and closed.
 */

export const FOLLOWUP_STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
export const FOLLOWUP_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const ACTIVITY_TYPES = ["call", "visit", "sms", "prayer", "note"] as const;

export const FOLLOWUP_REASONS = [
  "absent_4_weeks",
  "new_visitor",
  "new_convert",
  "welfare",
  "bereavement",
  "sickness",
  "custom",
] as const;

export const REASON_LABELS: Record<(typeof FOLLOWUP_REASONS)[number], string> = {
  absent_4_weeks: "Absent from services",
  new_visitor: "New visitor",
  new_convert: "New convert",
  welfare: "Welfare concern",
  bereavement: "Bereavement",
  sickness: "Sickness",
  custom: "Other",
};

export const STATUS_LABELS: Record<(typeof FOLLOWUP_STATUSES)[number], string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<(typeof FOLLOWUP_PRIORITIES)[number], string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

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

export const followupFormSchema = z
  .object({
    subject_member_id: optionalUuid,
    subject_visitor_id: optionalUuid,
    reason: z.enum(FOLLOWUP_REASONS).default("custom"),
    priority: z.enum(FOLLOWUP_PRIORITIES).default("normal"),
    due_on: optionalText,
    notes: optionalText,
  })
  .refine((v) => v.subject_member_id || v.subject_visitor_id, {
    message: "Choose the member or visitor this follow-up is about",
    path: ["subject_member_id"],
  });

export type FollowupFormValues = z.output<typeof followupFormSchema>;

export const activityFormSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).default("call"),
  notes: optionalText,
});

export type ActivityFormValues = z.output<typeof activityFormSchema>;

export const followupListQuerySchema = z.object({
  status: z.enum(["all", ...FOLLOWUP_STATUSES]).default("open"),
  priority: z.enum(FOLLOWUP_PRIORITIES).optional(),
  mine: z.enum(["all", "mine"]).default("all"),
});

export type FollowupListQuery = z.output<typeof followupListQuerySchema>;
