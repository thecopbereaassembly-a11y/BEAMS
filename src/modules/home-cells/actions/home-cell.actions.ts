"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  homeCellFormSchema,
  cellReportSchema,
  cellMemberSchema,
} from "../schemas/home-cell.schema";
import * as service from "../services/home-cell.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function readCellForm(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code"),
    leader_member_id: str(fd, "leader_member_id"),
    assistant_member_id: str(fd, "assistant_member_id"),
    meeting_day: str(fd, "meeting_day") || undefined,
    meeting_time: str(fd, "meeting_time"),
    location: str(fd, "location"),
    gps_address: str(fd, "gps_address"),
    is_active: fd.get("is_active") === "on",
  };
}

export async function createHomeCellAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = homeCellFormSchema.safeParse(readCellForm(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  let id: string;
  try {
    const result = await service.createHomeCell(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    id = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage home cells." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/home-cells");
  redirect(`/home-cells/${id}`);
}

export async function updateHomeCellAction(
  cellId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const parsed = homeCellFormSchema.safeParse(readCellForm(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.updateHomeCell(ctx, cellId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage home cells." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/home-cells");
  revalidatePath(`/home-cells/${cellId}`);
  redirect(`/home-cells/${cellId}`);
}

export async function addCellMemberAction(
  cellId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = cellMemberSchema.safeParse({
    member_id: str(formData, "member_id"),
    role: str(formData, "role") || "member",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.addMember(
      ctx,
      cellId,
      parsed.data.member_id,
      parsed.data.role,
    );
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add member." };
  }

  revalidatePath(`/home-cells/${cellId}`);
  return { success: "Member added to the cell." };
}

export async function removeCellMemberAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const cellId = str(formData, "cellId");
  const memberId = str(formData, "memberId");
  if (!cellId || !memberId) return;

  const result = await service.removeMember(ctx, cellId, memberId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath(`/home-cells/${cellId}`);
}

export async function submitCellReportAction(
  cellId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = cellReportSchema.safeParse({
    report_date: str(formData, "report_date"),
    attendance_count: str(formData, "attendance_count") || 0,
    visitors_count: str(formData, "visitors_count") || 0,
    offering_amount: str(formData, "offering_amount") || 0,
    testimonies: str(formData, "testimonies"),
    prayer_points: str(formData, "prayer_points"),
    absentees_note: str(formData, "absentees_note"),
    followups_note: str(formData, "followups_note"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.submitReport(ctx, cellId, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save report." };
  }

  revalidatePath(`/home-cells/${cellId}`);
  return { success: "Weekly report submitted." };
}
