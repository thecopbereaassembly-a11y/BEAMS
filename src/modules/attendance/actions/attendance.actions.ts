"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  sessionFormSchema,
  attendanceBatchSchema,
  headcountSchema,
} from "../schemas/attendance.schema";
import * as service from "../services/attendance.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

/** Result shape the offline sync engine relies on. */
export interface SyncResult {
  ok: boolean;
  saved?: number;
  error?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createSessionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = sessionFormSchema.safeParse({
    service_type_id: str(formData, "service_type_id"),
    service_date: str(formData, "service_date"),
    title: str(formData, "title"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  let id: string;
  try {
    const result = await service.createSession(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    id = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot record attendance." };
    return { error: error instanceof Error ? error.message : "Could not create session." };
  }

  revalidatePath("/attendance");
  redirect(`/attendance/${id}`);
}

/**
 * The endpoint the capture screen AND the offline sync engine both call.
 * Idempotent: replaying the same marks updates rather than duplicating.
 */
export async function saveAttendanceAction(
  marks: unknown,
): Promise<SyncResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Please sign in again." };

  const parsed = attendanceBatchSchema.safeParse({ marks });
  if (!parsed.success) {
    return { ok: false, error: "Some attendance marks were invalid and were not saved." };
  }

  try {
    const result = await service.saveMarks(ctx, parsed.data.marks);
    if (!result.ok) return { ok: false, error: result.error.message };

    const sessionId = parsed.data.marks[0]?.session_id;
    if (sessionId) revalidatePath(`/attendance/${sessionId}`);
    return { ok: true, saved: result.data };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "You do not have permission to record attendance." };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save attendance.",
    };
  }
}

export async function saveHeadcountAction(
  sessionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const categories = ["men", "women", "youth", "children", "visitors"] as const;

  try {
    for (const category of categories) {
      const raw = str(formData, category);
      if (raw === "") continue;
      const parsed = headcountSchema.safeParse({
        session_id: sessionId,
        category,
        headcount: raw,
      });
      if (!parsed.success) {
        return { fieldErrors: { [category]: ["Enter a whole number of 0 or more"] } };
      }
      const result = await service.saveHeadcount(ctx, parsed.data);
      if (!result.ok) return { error: result.error.message };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save counts." };
  }

  revalidatePath(`/attendance/${sessionId}`);
  return { success: "Headcounts saved." };
}
