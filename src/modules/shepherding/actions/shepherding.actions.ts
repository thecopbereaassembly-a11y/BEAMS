"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { followupFormSchema, activityFormSchema } from "../schemas/followup.schema";
import * as service from "../services/shepherding.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createFollowupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = followupFormSchema.safeParse({
    subject_member_id: str(formData, "subject_member_id"),
    subject_visitor_id: str(formData, "subject_visitor_id"),
    reason: str(formData, "reason") || "custom",
    priority: str(formData, "priority") || "normal",
    due_on: str(formData, "due_on"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.createFollowup(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage follow-ups." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/shepherding");
  return { success: "Follow-up created." };
}

/** Runs the absentee sweep on demand (the cron job will call the same service). */
export async function generateAbsenteesAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  try {
    const result = await service.generateAbsenteeFollowups(ctx);
    if (!result.ok) return { error: result.error.message };

    const { created, skipped } = result.data;
    revalidatePath("/shepherding");
    return {
      success:
        created === 0
          ? skipped > 0
            ? `No new follow-ups — ${skipped} absentee${skipped === 1 ? "" : "s"} already have one open.`
            : "No absentees found."
          : `${created} follow-up${created === 1 ? "" : "s"} created${skipped > 0 ? `, ${skipped} already open` : ""}.`,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage follow-ups." };
    return { error: error instanceof Error ? error.message : "Could not run the sweep." };
  }
}

export async function assignShepherdAction(
  followupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const shepherdId = str(formData, "shepherd_member_id");
  if (!shepherdId) return { fieldErrors: { shepherd_member_id: ["Choose a shepherd"] } };

  try {
    const result = await service.assignShepherd(ctx, followupId, shepherdId);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not assign." };
  }

  revalidatePath("/shepherding");
  revalidatePath(`/shepherding/${followupId}`);
  return { success: "Shepherd assigned." };
}

export async function logActivityAction(
  followupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = activityFormSchema.safeParse({
    activity_type: str(formData, "activity_type") || "call",
    notes: str(formData, "notes"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.logActivity(ctx, followupId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not log activity." };
  }

  revalidatePath(`/shepherding/${followupId}`);
  return { success: "Activity logged." };
}

export async function closeFollowupAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const followupId = str(formData, "followupId");
  if (!followupId) return;

  const result = await service.closeFollowup(ctx, followupId, str(formData, "outcome") || null);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/shepherding");
  revalidatePath(`/shepherding/${followupId}`);
}
