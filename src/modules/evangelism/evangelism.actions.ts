"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { programFormSchema, soulFormSchema, createProgram, recordSoul } from "./evangelism.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createProgramAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = programFormSchema.safeParse({
    name: str(formData, "name"),
    description: str(formData, "description"),
    location: str(formData, "location"),
    starts_on: str(formData, "starts_on"),
    ends_on: str(formData, "ends_on"),
    target_souls: str(formData, "target_souls") || undefined,
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createProgram(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage evangelism." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/evangelism");
  return { success: "Outreach created." };
}

export async function recordSoulAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = soulFormSchema.safeParse({
    program_id: str(formData, "program_id"),
    full_name: str(formData, "full_name"),
    gender: str(formData, "gender") || undefined,
    phone: str(formData, "phone"),
    address: str(formData, "address"),
    decision: str(formData, "decision") || "first_time",
    won_on: str(formData, "won_on"),
    won_by_member_id: str(formData, "won_by_member_id"),
    create_followup: formData.get("create_followup") === "on",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await recordSoul(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    revalidatePath("/evangelism");
    revalidatePath("/shepherding");
    return {
      success: result.data.followupCreated
        ? "Recorded — a follow-up has been raised so someone visits them."
        : "Recorded.",
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage evangelism." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }
}
