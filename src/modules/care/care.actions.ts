"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  counsellingFormSchema,
  counsellingSessionSchema,
  welfareFormSchema,
  createCounsellingCase,
  addSession,
  createWelfareCase,
  approveWelfare,
} from "./care.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

/** Confidential modules return an explicit permission message, never silence. */
const forbidden = (what: string) => ({
  error: `You do not have permission to manage ${what}. These records are restricted.`,
});

export async function createCounsellingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = counsellingFormSchema.safeParse({
    member_id: str(formData, "member_id"),
    title: str(formData, "title"),
    status: str(formData, "status") || "open",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createCounsellingCase(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden("counselling cases");
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/counselling");
  return { success: "Case opened." };
}

export async function addCounsellingSessionAction(
  caseId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = counsellingSessionSchema.safeParse({
    session_on: str(formData, "session_on"),
    location: str(formData, "location"),
    summary: str(formData, "summary"),
    next_steps: str(formData, "next_steps"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await addSession(ctx, caseId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden("counselling cases");
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath(`/counselling/${caseId}`);
  return { success: "Session recorded." };
}

export async function createWelfareAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = welfareFormSchema.safeParse({
    member_id: str(formData, "member_id"),
    title: str(formData, "title"),
    description: str(formData, "description"),
    amount_requested: str(formData, "amount_requested") || undefined,
    status: str(formData, "status") || "open",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createWelfareCase(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return forbidden("welfare cases");
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/welfare");
  return { success: "Welfare case opened." };
}

export async function approveWelfareAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const caseId = str(formData, "caseId");
  const amount = Number(str(formData, "amount"));
  if (!caseId || Number.isNaN(amount)) return;

  const result = await approveWelfare(ctx, caseId, amount);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/welfare");
  revalidatePath(`/welfare/${caseId}`);
}
