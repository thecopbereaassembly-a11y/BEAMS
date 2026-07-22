"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { ministryFormSchema, ministryMemberSchema } from "../schemas/ministry.schema";
import * as service from "../services/ministry.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function readForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code"),
    category: str(fd, "category") || "ministry",
    description: str(fd, "description"),
    leader_member_id: str(fd, "leader_member_id"),
    is_active: fd.get("is_active") === "on",
  };
}

export async function createMinistryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = ministryFormSchema.safeParse(readForm(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  let id: string;
  try {
    const result = await service.createMinistry(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    id = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage ministries." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/ministries");
  redirect(`/ministries/${id}`);
}

export async function updateMinistryAction(
  ministryId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = ministryFormSchema.safeParse(readForm(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.updateMinistry(ctx, ministryId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage ministries." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/ministries");
  revalidatePath(`/ministries/${ministryId}`);
  redirect(`/ministries/${ministryId}`);
}

export async function addMinistryMemberAction(
  ministryId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = ministryMemberSchema.safeParse({ member_id: str(formData, "member_id") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.addMember(ctx, ministryId, parsed.data.member_id);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add member." };
  }

  revalidatePath(`/ministries/${ministryId}`);
  return { success: "Member added to the ministry." };
}

export async function removeMinistryMemberAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const ministryId = str(formData, "ministryId");
  const memberId = str(formData, "memberId");
  if (!ministryId || !memberId) return;

  const result = await service.removeMember(ctx, ministryId, memberId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath(`/ministries/${ministryId}`);
}
