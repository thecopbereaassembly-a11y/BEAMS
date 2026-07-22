"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { visitorFormSchema } from "../schemas/visitor.schema";
import * as service from "../services/visitor.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createVisitorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = visitorFormSchema.safeParse({
    first_name: str(formData, "first_name"),
    last_name: str(formData, "last_name"),
    gender: str(formData, "gender") || undefined,
    phone: str(formData, "phone"),
    email: str(formData, "email"),
    address: str(formData, "address"),
    source_id: str(formData, "source_id"),
    invited_by_member_id: str(formData, "invited_by_member_id"),
    first_visit_on: str(formData, "first_visit_on"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  let id: string;
  try {
    const result = await service.createVisitor(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    id = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot record visitors." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/visitors");
  redirect(`/visitors/${id}`);
}

export async function logReturnVisitAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const visitorId = str(formData, "visitorId");
  if (!visitorId) return;

  const result = await service.logReturnVisit(ctx, visitorId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath(`/visitors/${visitorId}`);
}

export async function convertVisitorAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const visitorId = str(formData, "visitorId");
  if (!visitorId) return;

  const result = await service.convertToMember(ctx, visitorId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath("/visitors");
  revalidatePath("/members");
  redirect(`/members/${result.data}`);
}
