import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/** Events & registration (docs/04 §13). */

export type ChurchEvent = Tables<"event">;
export type EventRegistration = Tables<"event_registration">;

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const eventFormSchema = z
  .object({
    title: z.string().trim().min(1, "Event title is required").max(160),
    description: optionalText,
    location: optionalText,
    starts_at: z.string().trim().min(1, "Start date and time are required"),
    ends_at: optionalText,
    requires_registration: z.coerce.boolean().default(false),
    capacity: z.coerce.number().int().min(0).optional(),
  })
  .refine(
    (v) => !v.ends_at || new Date(v.ends_at) >= new Date(v.starts_at),
    { message: "End time cannot be before the start time", path: ["ends_at"] },
  );

export type EventFormValues = z.output<typeof eventFormSchema>;

export interface EventEntry extends ChurchEvent {
  registrationCount: number;
}

export async function listEvents(
  ctx: AuthContext,
  scope: "upcoming" | "past" | "all" = "upcoming",
): Promise<Result<EventEntry[]>> {
  requirePermission(ctx, "event.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const now = new Date().toISOString();

  let builder = supabase
    .from("event")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null);

  if (scope === "upcoming") builder = builder.gte("starts_at", now);
  if (scope === "past") builder = builder.lt("starts_at", now);

  const { data, error } = await builder.order("starts_at", {
    ascending: scope !== "past",
  });
  if (error) throw new Error(`Failed to load events: ${error.message}`);
  if (!data?.length) return ok([]);

  const { data: registrations } = await supabase
    .from("event_registration")
    .select("event_id")
    .eq("assembly_id", ctx.assemblyId)
    .in("event_id", data.map((e) => e.id))
    .neq("status", "cancelled");

  const counts = (registrations ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.event_id] = (acc[r.event_id] ?? 0) + 1;
    return acc;
  }, {});

  return ok(data.map((e) => ({ ...e, registrationCount: counts[e.id] ?? 0 })));
}

export async function getEvent(
  ctx: AuthContext,
  eventId: string,
): Promise<Result<ChurchEvent>> {
  requirePermission(ctx, "event.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load event: ${error.message}`);
  if (!data) return err(AppError.notFound("Event not found"));
  return ok(data);
}

export async function createEvent(
  ctx: AuthContext,
  values: EventFormValues,
): Promise<Result<ChurchEvent>> {
  requirePermission(ctx, "event.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event")
    .insert({
      assembly_id: ctx.assemblyId,
      title: values.title,
      description: values.description ?? null,
      location: values.location ?? null,
      starts_at: new Date(values.starts_at).toISOString(),
      ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
      requires_registration: values.requires_registration,
      capacity: values.capacity ?? null,
      status: "scheduled",
      visibility: "assembly",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create event: ${error.message}`);
  return ok(data);
}

export interface RegistrationEntry {
  id: string;
  member_id: string | null;
  guest_name: string | null;
  party_size: number;
  status: string;
  name: string;
}

export async function listRegistrations(
  ctx: AuthContext,
  eventId: string,
): Promise<Result<RegistrationEntry[]>> {
  requirePermission(ctx, "event.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_registration")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .eq("event_id", eventId)
    .neq("status", "cancelled");

  if (error) throw new Error(`Failed to load registrations: ${error.message}`);
  if (!data?.length) return ok([]);

  const memberIds = data.map((r) => r.member_id).filter(Boolean) as string[];
  const { data: members } = memberIds.length
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .in("id", memberIds)
    : { data: [] };

  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  return ok(
    data.map((r) => {
      const member = r.member_id ? byId.get(r.member_id) : null;
      return {
        id: r.id,
        member_id: r.member_id,
        guest_name: r.guest_name,
        party_size: r.party_size,
        status: r.status,
        name: member
          ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
          : (r.guest_name ?? "Guest"),
      };
    }),
  );
}

/**
 * Registers a member. Respects capacity by moving late registrations to a
 * waitlist rather than rejecting them outright.
 */
export async function register(
  ctx: AuthContext,
  eventId: string,
  memberId: string,
  partySize = 1,
): Promise<Result<{ status: string }>> {
  requirePermission(ctx, "event.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const eventResult = await getEvent(ctx, eventId);
  if (!eventResult.ok) return err(eventResult.error);
  const event = eventResult.data;

  let status = "registered";
  if (event.capacity && event.capacity > 0) {
    const existing = await listRegistrations(ctx, eventId);
    const taken = existing.ok
      ? existing.data.reduce((sum, r) => sum + (r.party_size ?? 1), 0)
      : 0;
    if (taken + partySize > event.capacity) status = "waitlist";
  }

  const supabase = await createClient();
  const { error } = await supabase.from("event_registration").upsert(
    {
      assembly_id: ctx.assemblyId,
      event_id: eventId,
      member_id: memberId,
      party_size: partySize,
      status,
      created_by: ctx.userId,
    },
    { onConflict: "event_id,member_id" },
  );

  if (error) throw new Error(`Failed to register: ${error.message}`);
  return ok({ status });
}

export async function cancelRegistration(
  ctx: AuthContext,
  registrationId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "event.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_registration")
    .update({ status: "cancelled" })
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", registrationId);

  if (error) throw new Error(`Failed to cancel: ${error.message}`);
  return ok(true);
}
