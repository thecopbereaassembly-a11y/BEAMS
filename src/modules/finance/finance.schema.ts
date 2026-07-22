import { z } from "zod";
import { CHANNELS, MOMO_NETWORKS } from "./finance.constants";

/**
 * Finance validation (docs/04 §14). Money is the most audit-critical data in the
 * system, so the rules here are deliberately strict: amounts must be positive,
 * MoMo contributions must say which network, and nothing is silently coerced.
 */

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

/** Money: positive, at most 2 decimal places. */
const amount = z.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .positive("Amount must be greater than zero")
  .refine(
    (v) => Number.isInteger(Math.round(v * 100)) && Math.round(v * 100) / 100 === v,
    "Use at most 2 decimal places",
  );

export const contributionFormSchema = z
  .object({
    member_id: optionalUuid,
    is_anonymous: z.coerce.boolean().default(false),
    contribution_type_id: z.string().uuid("Choose what this is for"),
    fund_id: optionalUuid,
    amount,
    channel: z.enum(CHANNELS).default("momo"),
    momo_network: z.enum(MOMO_NETWORKS).optional(),
    reference: optionalText,
    contributed_on: z
      .string()
      .trim()
      .min(1, "Date is required")
      .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
    note: optionalText,
  })
  .refine((v) => v.channel !== "momo" || Boolean(v.momo_network), {
    message: "Choose the Mobile Money network",
    path: ["momo_network"],
  })
  .refine((v) => v.is_anonymous || Boolean(v.member_id), {
    message: "Choose a member, or mark the gift anonymous",
    path: ["member_id"],
  });

export type ContributionFormValues = z.output<typeof contributionFormSchema>;

export const expenditureFormSchema = z.object({
  category_id: optionalUuid,
  fund_id: optionalUuid,
  payee: z.string().trim().min(1, "Who was paid?"),
  description: optionalText,
  amount,
  channel: z.enum(CHANNELS).default("cash"),
  spent_on: z
    .string()
    .trim()
    .min(1, "Date is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  reference: optionalText,
});

export type ExpenditureFormValues = z.output<typeof expenditureFormSchema>;

export const pledgeFormSchema = z.object({
  member_id: z.string().uuid("Choose a member"),
  fund_id: optionalUuid,
  campaign: optionalText,
  amount_pledged: amount,
  due_on: optionalText,
});

export type PledgeFormValues = z.output<typeof pledgeFormSchema>;
