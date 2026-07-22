"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { prayerFormSchema, createPrayerRequest, markAnswered } from "./prayer.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createPrayerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = prayerFormSchema.safeParse({
    title: str(formData, "title"),
    body: str(formData, "body"),
    privacy: str(formData, "privacy") || "leaders_only",
    member_id: str(formData, "member_id"),
    requester_name: str(formData, "requester_name"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createPrayerRequest(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot add prayer requests." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/prayer-requests");
  return { success: "Prayer request recorded." };
}

export async function markAnsweredAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const requestId = str(formData, "requestId");
  if (!requestId) return;

  const result = await markAnswered(ctx, requestId, str(formData, "testimony") || null);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/prayer-requests");
}
