"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  eventFormSchema,
  createEvent,
  register,
  cancelRegistration,
} from "./events.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createEventAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = eventFormSchema.safeParse({
    title: str(formData, "title"),
    description: str(formData, "description"),
    location: str(formData, "location"),
    starts_at: str(formData, "starts_at"),
    ends_at: str(formData, "ends_at"),
    requires_registration: formData.get("requires_registration") === "on",
    capacity: str(formData, "capacity") || undefined,
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  let id: string;
  try {
    const result = await createEvent(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
    id = result.data.id;
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot create events." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/events");
  redirect(`/events/${id}`);
}

export async function registerAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const memberId = str(formData, "member_id");
  if (!memberId) return { fieldErrors: { member_id: ["Choose a member"] } };

  try {
    const result = await register(ctx, eventId, memberId, Number(str(formData, "party_size")) || 1);
    if (!result.ok) return { error: result.error.message };

    revalidatePath(`/events/${eventId}`);
    return {
      success:
        result.data.status === "waitlist"
          ? "Event is full — added to the waitlist."
          : "Registered.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not register." };
  }
}

export async function cancelRegistrationAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const registrationId = str(formData, "registrationId");
  const eventId = str(formData, "eventId");
  if (!registrationId) return;

  const result = await cancelRegistration(ctx, registrationId);
  if (!result.ok) throw new Error(result.error.message);

  revalidatePath(`/events/${eventId}`);
}
