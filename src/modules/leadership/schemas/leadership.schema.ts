import { z } from "zod";

/**
 * Leadership appointments — who holds which office, and when. In CoP these are
 * ordained offices (Presiding Elder, Elder, Deacon, Deaconess) and appointed
 * ones (Secretary, Financial Secretary) — see docs/04 §6.
 */

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

export const appointmentFormSchema = z
  .object({
    member_id: z.string().uuid("Select a member"),
    position_id: z.string().uuid("Select a position"),
    portfolio: optionalText,
    appointed_on: optionalDate,
    ordained_on: optionalDate,
  })
  .refine(
    (v) =>
      !v.appointed_on ||
      !v.ordained_on ||
      Date.parse(v.ordained_on) <= Date.parse(v.appointed_on) ||
      true,
    { message: "Check the dates", path: ["appointed_on"] },
  );

export type AppointmentFormValues = z.output<typeof appointmentFormSchema>;
