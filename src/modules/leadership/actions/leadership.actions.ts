"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { appointmentFormSchema } from "../schemas/leadership.schema";
import * as service from "../services/leadership.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function appointOfficerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = appointmentFormSchema.safeParse({
    member_id: str(formData, "member_id"),
    position_id: str(formData, "position_id"),
    portfolio: str(formData, "portfolio"),
    appointed_on: str(formData, "appointed_on"),
    ordained_on: str(formData, "ordained_on"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await service.appointOfficer(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage leadership." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/leadership");
  return { success: "Appointment recorded." };
}

export async function endAppointmentAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const appointmentId = str(formData, "appointmentId");
  if (!appointmentId) return;

  const result = await service.endAppointment(ctx, appointmentId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/leadership");
}
