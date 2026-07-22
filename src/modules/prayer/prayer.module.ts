import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/**
 * Prayer requests (docs/04 §15). Compact single-file module: the domain is small
 * enough that splitting it across five files would be ceremony, not clarity.
 *
 * Privacy is the interesting part — `public` requests appear on the prayer wall,
 * `leaders_only` are pastoral, `private` are between the requester and God.
 */

export type PrayerRequest = Tables<"prayer_request">;

export { PRIVACY_LEVELS, PRAYER_STATUSES, PRIVACY_LABELS } from "./prayer.constants";
import { PRIVACY_LEVELS } from "./prayer.constants";

export const prayerFormSchema = z.object({
  title: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  body: z.string().trim().min(1, "Please describe the prayer request"),
  privacy: z.enum(PRIVACY_LEVELS).default("leaders_only"),
  member_id: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional()
    .refine(
      (v) => v === undefined || z.string().uuid().safeParse(v).success,
      "Invalid selection",
    ),
  requester_name: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type PrayerFormValues = z.output<typeof prayerFormSchema>;

export async function listPrayerRequests(
  ctx: AuthContext,
  status: "open" | "answered" | "all" = "open",
): Promise<Result<(PrayerRequest & { requesterName: string })[]>> {
  requirePermission(ctx, "prayer.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  let builder = supabase
    .from("prayer_request")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null);

  if (status === "open") builder = builder.in("status", ["open", "praying"]);
  if (status === "answered") builder = builder.eq("is_answered", true);

  const { data, error } = await builder.order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load prayer requests: ${error.message}`);
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
        ...r,
        requesterName: member
          ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
          : (r.requester_name ?? "Anonymous"),
      };
    }),
  );
}

export async function createPrayerRequest(
  ctx: AuthContext,
  values: PrayerFormValues,
): Promise<Result<PrayerRequest>> {
  requirePermission(ctx, "prayer.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prayer_request")
    .insert({
      assembly_id: ctx.assemblyId,
      // Default to the signed-in user's own member record when none is chosen.
      member_id: values.member_id ?? ctx.memberId,
      requester_name: values.requester_name ?? null,
      title: values.title ?? null,
      body: values.body,
      privacy: values.privacy,
      status: "open",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save prayer request: ${error.message}`);
  return ok(data);
}

export async function markAnswered(
  ctx: AuthContext,
  requestId: string,
  testimony: string | null,
): Promise<Result<true>> {
  requirePermission(ctx, "prayer.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("prayer_request")
    .update({
      is_answered: true,
      status: "answered",
      answered_on: new Date().toISOString().slice(0, 10),
      updated_by: ctx.userId,
    })
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", requestId);

  if (error) throw new Error(`Failed to update request: ${error.message}`);

  if (testimony) {
    await supabase.from("prayer_update").insert({
      assembly_id: ctx.assemblyId,
      prayer_request_id: requestId,
      body: testimony,
      is_testimony: true,
      created_by: ctx.userId,
    });
  }

  return ok(true);
}
