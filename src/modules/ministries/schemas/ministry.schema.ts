import { z } from "zod";

/**
 * Ministries / movements. In The Church of Pentecost these include the men's
 * (PEMEM) and women's (PEWOMOM) movements, Youth, PENSA, Children's and
 * Evangelism ministries (docs/01 §2).
 */

export const MINISTRY_CATEGORIES = ["movement", "ministry", "committee"] as const;

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

export const ministryFormSchema = z.object({
  name: z.string().trim().min(1, "Ministry name is required").max(120),
  code: optionalText,
  category: z.enum(MINISTRY_CATEGORIES).default("ministry"),
  description: optionalText,
  leader_member_id: optionalUuid,
  is_active: z.coerce.boolean().default(true),
});

export type MinistryFormValues = z.output<typeof ministryFormSchema>;

export const ministryListQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.enum(MINISTRY_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type MinistryListQuery = z.output<typeof ministryListQuerySchema>;

export const ministryMemberSchema = z.object({
  member_id: z.string().uuid("Select a member"),
});

export const CATEGORY_LABELS: Record<(typeof MINISTRY_CATEGORIES)[number], string> = {
  movement: "Movement",
  ministry: "Ministry",
  committee: "Committee",
};
