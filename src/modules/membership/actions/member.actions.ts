"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { memberFormSchema } from "../schemas/member.schema";
import * as service from "../services/membership.service";

export interface MemberFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Pull the member form out of FormData; checkboxes arrive as "on"/absent. */
function readForm(formData: FormData) {
  const value = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  return {
    first_name: value("first_name"),
    middle_name: value("middle_name"),
    last_name: value("last_name"),
    preferred_name: value("preferred_name"),
    gender: value("gender") || undefined,
    date_of_birth: value("date_of_birth"),
    marital_status: value("marital_status") || undefined,
    wedding_anniversary: value("wedding_anniversary"),
    primary_phone: value("primary_phone"),
    primary_email: value("primary_email"),
    residential_address: value("residential_address"),
    gps_address: value("gps_address"),
    landmark: value("landmark"),
    current_status: value("current_status") || "member",
    joined_on: value("joined_on"),
    home_cell_id: value("home_cell_id"),
    is_water_baptized: formData.get("is_water_baptized") === "on",
    is_holy_spirit_baptized: formData.get("is_holy_spirit_baptized") === "on",
    occupation_title: value("occupation_title"),
    employer: value("employer"),
    notes_summary: value("notes_summary"),
  };
}

/**
 * Thin controller (docs/07 §1): authenticate → validate (Zod) → delegate to the
 * service → revalidate → redirect. Business rules live in the service; the
 * audit trail is written by database triggers on `member`.
 */
export async function createMemberAction(
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = memberFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let newId: string;
  try {
    const result = await service.createMember(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    newId = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to add members." };
    }
    return { error: error instanceof Error ? error.message : "Could not save member." };
  }

  revalidatePath("/members");
  redirect(`/members/${newId}`);
}

export async function updateMemberAction(
  memberId: string,
  _prev: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = memberFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const result = await service.updateMember(ctx, memberId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to edit members." };
    }
    return { error: error instanceof Error ? error.message : "Could not save member." };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect(`/members/${memberId}`);
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const memberId = formData.get("memberId");
  if (typeof memberId !== "string") return;

  const result = await service.deleteMember(ctx, memberId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/members");
  redirect("/members?deleted=1");
}
