import { z } from "zod";

/** Visitors — first-time and repeat, with a path to full membership (docs/04 §7). */

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

const ghanaPhone = z
  .string()
  .trim()
  .regex(
    /^(\+?233|0)\s?\d{2}\s?\d{3}\s?\d{4}$/,
    "Enter a valid Ghana phone number (e.g. 024 412 3456)",
  );

export const visitorFormSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: optionalText,
  gender: z.enum(["male", "female"]).optional(),
  phone: ghanaPhone.optional().or(z.literal("").transform(() => undefined)),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: optionalText,
  source_id: optionalUuid,
  invited_by_member_id: optionalUuid,
  first_visit_on: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine(
      (v) => v === undefined || !Number.isNaN(Date.parse(v)),
      "Enter a valid date",
    ),
  notes: optionalText,
});

export type VisitorFormValues = z.output<typeof visitorFormSchema>;

export const visitorListQuerySchema = z.object({
  q: z.string().trim().optional(),
  converted: z.enum(["all", "yes", "no"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type VisitorListQuery = z.output<typeof visitorListQuerySchema>;
