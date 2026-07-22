"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  contributionFormSchema,
  expenditureFormSchema,
  pledgeFormSchema,
} from "./finance.schema";
import { recordContribution, recordExpenditure, createPledge } from "./finance.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

const forbidden = { error: "Finance records are restricted. You do not have permission." };

export async function recordContributionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = contributionFormSchema.safeParse({
    member_id: str(formData, "member_id"),
    is_anonymous: formData.get("is_anonymous") === "on",
    contribution_type_id: str(formData, "contribution_type_id"),
    fund_id: str(formData, "fund_id"),
    amount: str(formData, "amount"),
    channel: str(formData, "channel") || "momo",
    momo_network: str(formData, "momo_network") || undefined,
    reference: str(formData, "reference"),
    contributed_on: str(formData, "contributed_on"),
    note: str(formData, "note"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await recordContribution(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/finance");
    return { success: `Recorded. Receipt ${result.data.receiptNo}.` };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden;
    return { error: error instanceof Error ? error.message : "Could not record." };
  }
}

export async function recordExpenditureAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = expenditureFormSchema.safeParse({
    category_id: str(formData, "category_id"),
    fund_id: str(formData, "fund_id"),
    payee: str(formData, "payee"),
    description: str(formData, "description"),
    amount: str(formData, "amount"),
    channel: str(formData, "channel") || "cash",
    spent_on: str(formData, "spent_on"),
    reference: str(formData, "reference"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await recordExpenditure(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/finance");
    return { success: "Expenditure recorded." };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden;
    return { error: error instanceof Error ? error.message : "Could not record." };
  }
}

export async function createPledgeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = pledgeFormSchema.safeParse({
    member_id: str(formData, "member_id"),
    fund_id: str(formData, "fund_id"),
    campaign: str(formData, "campaign"),
    amount_pledged: str(formData, "amount_pledged"),
    due_on: str(formData, "due_on"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createPledge(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/finance");
    return { success: "Pledge recorded." };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden;
    return { error: error instanceof Error ? error.message : "Could not record." };
  }
}
