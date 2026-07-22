import { z } from "zod";

/**
 * Membership validation — the SINGLE source of truth, imported by both the
 * client form and the server action (docs/02 §4). Ghana-localized: +233 phone
 * shapes, Ghana Post GPS addresses.
 */

export const GENDERS = ["male", "female"] as const;
export const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
  "separated",
] as const;
export const MEMBER_STATES = [
  "visitor",
  "new_convert",
  "member",
  "inactive",
  "transferred_out",
  "deceased",
] as const;

/** Accepts 0244123456, +233244123456, 233 24 412 3456 … */
const ghanaPhone = z
  .string()
  .trim()
  .regex(
    /^(\+?233|0)\s?\d{2}\s?\d{3}\s?\d{4}$/,
    "Enter a valid Ghana phone number (e.g. 024 412 3456)",
  );

/** Ghana Post GPS, e.g. GA-123-4567 */
const gpsAddress = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}-\d{3,4}-\d{4}$/i, "Format should look like GA-123-4567");

/** Trim, and treat empty strings from HTML forms as "not provided". */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional()
  .refine(
    (v) => v === undefined || !Number.isNaN(Date.parse(v)),
    "Enter a valid date",
  );

export const memberFormSchema = z.object({
  // Identity
  first_name: z.string().trim().min(1, "First name is required").max(80),
  middle_name: optionalText,
  last_name: z.string().trim().min(1, "Last name is required").max(80),
  preferred_name: optionalText,
  gender: z.enum(GENDERS).optional(),
  date_of_birth: optionalDate,
  marital_status: z.enum(MARITAL_STATUSES).optional(),
  wedding_anniversary: optionalDate,

  // Contact
  primary_phone: ghanaPhone.optional().or(z.literal("").transform(() => undefined)),
  primary_email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Location
  residential_address: optionalText,
  gps_address: gpsAddress.optional().or(z.literal("").transform(() => undefined)),
  landmark: optionalText,

  // Church life
  current_status: z.enum(MEMBER_STATES).default("member"),
  joined_on: optionalDate,
  home_cell_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  is_water_baptized: z.coerce.boolean().default(false),
  is_holy_spirit_baptized: z.coerce.boolean().default(false),

  // Background
  occupation_title: optionalText,
  employer: optionalText,
  notes_summary: optionalText,
});

export type MemberFormInput = z.input<typeof memberFormSchema>;
export type MemberFormValues = z.output<typeof memberFormSchema>;

/** List query params — shared shape for every list view (docs/07 §4). */
export const memberListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(MEMBER_STATES).optional(),
  home_cell_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["last_name", "first_name", "created_at", "joined_on"]).default("last_name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export type MemberListQuery = z.output<typeof memberListQuerySchema>;

/** Human labels for enum values. */
export const STATUS_LABELS: Record<(typeof MEMBER_STATES)[number], string> = {
  visitor: "Visitor",
  new_convert: "New convert",
  member: "Member",
  inactive: "Inactive",
  transferred_out: "Transferred out",
  deceased: "Deceased",
};

export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  male: "Male",
  female: "Female",
};

export const MARITAL_LABELS: Record<(typeof MARITAL_STATUSES)[number], string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Separated",
};
