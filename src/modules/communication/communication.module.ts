import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import { resolveSmsProvider } from "@/lib/integrations/sms/adapters";
import { resolveEmailProvider } from "@/lib/integrations/email/adapters";
import { smsSegments, renderTemplate } from "@/lib/integrations/ports";
import { resolveSegment, applyConsent, type Recipient } from "./segments";
import type { Tables } from "@/shared/types/database.types";

/** Campaign send pipeline (docs/04 §16). */

export type Campaign = Tables<"message_campaign">;

export const campaignFormSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  channel: z.enum(["sms", "email"]).default("sms"),
  segment_key: z.string().trim().min(1, "Choose who this goes to"),
  subject: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
  body: z.string().trim().min(1, "Write a message"),
});

export type CampaignFormValues = z.output<typeof campaignFormSchema>;

export interface SendPreview {
  total: number;
  reachable: number;
  optedOut: number;
  missingContact: number;
  segments: number;
  estimatedCost: number;
  providerConfigured: boolean;
  providerName: string;
}

/** Dry-run figures shown BEFORE sending, so spend is never a surprise. */
export async function previewSend(
  ctx: AuthContext,
  segmentKey: string,
  channel: "sms" | "email",
  body: string,
): Promise<Result<SendPreview>> {
  requirePermission(ctx, "communication.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const recipients = await resolveSegment(ctx, segmentKey);
  const { allowed, optedOut } = await applyConsent(ctx, recipients, channel);

  const reachable = allowed.filter((r) => (channel === "sms" ? r.phone : r.email));
  const segments = channel === "sms" ? smsSegments(body) : 1;

  const { provider, configured } =
    channel === "sms" ? resolveSmsProvider() : resolveEmailProvider();

  const estimatedCost =
    channel === "sms" && "estimateCost" in provider
      ? provider.estimateCost(reachable.length, segments)
      : 0;

  return ok({
    total: recipients.length,
    reachable: reachable.length,
    optedOut,
    missingContact: allowed.length - reachable.length,
    segments,
    estimatedCost,
    providerConfigured: configured,
    providerName: provider.name,
  });
}

/**
 * Sends a campaign and records every recipient's outcome.
 *
 * Order matters: the campaign row is written FIRST so that if the process dies
 * mid-send there is still a record of what was attempted.
 */
export async function sendCampaign(
  ctx: AuthContext,
  values: CampaignFormValues,
): Promise<Result<{ campaignId: string; sent: number; failed: number; cost: number; simulated: boolean }>> {
  requirePermission(ctx, "communication.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const recipients = await resolveSegment(ctx, values.segment_key);
  const { allowed } = await applyConsent(ctx, recipients, values.channel);
  const reachable = allowed.filter((r) => (values.channel === "sms" ? r.phone : r.email));

  if (reachable.length === 0) {
    return err(
      new AppError("validation", "Nobody in that group has a usable contact detail."),
    );
  }

  const supabase = await createClient();
  const { provider, configured } =
    values.channel === "sms" ? resolveSmsProvider() : resolveEmailProvider();

  const { data: campaign, error: campaignErr } = await supabase
    .from("message_campaign")
    .insert({
      assembly_id: ctx.assemblyId,
      name: values.name ?? null,
      channel: values.channel,
      subject: values.subject ?? null,
      body: values.body,
      status: "sending",
      provider: provider.name,
      recipients_count: reachable.length,
      cost_currency: "GHS",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (campaignErr) throw new Error(`Failed to create campaign: ${campaignErr.message}`);

  const personalise = (r: Recipient) =>
    renderTemplate(values.body, {
      first_name: r.first_name,
      name: r.name,
    });

  const results =
    values.channel === "sms"
      ? await (provider as ReturnType<typeof resolveSmsProvider>["provider"]).send(
          reachable.map((r) => ({
            to: r.phone as string,
            body: personalise(r),
            reference: `${campaign.id}:${r.member_id}`,
          })),
        )
      : await (provider as ReturnType<typeof resolveEmailProvider>["provider"]).send(
          reachable.map((r) => ({
            to: r.email as string,
            subject: values.subject ?? "Message from your assembly",
            html: `<p>${personalise(r).replace(/\n/g, "<br>")}</p>`,
            reference: `${campaign.id}:${r.member_id}`,
          })),
        );

  const byAddress = new Map(results.map((res) => [res.to, res]));
  let sent = 0;
  let failed = 0;
  let cost = 0;

  const recipientRows = reachable.map((r) => {
    const address = (values.channel === "sms" ? r.phone : r.email) as string;
    const result = byAddress.get(address);
    if (result?.ok) {
      sent += 1;
      cost += result.cost ?? 0;
    } else {
      failed += 1;
    }
    return {
      assembly_id: ctx.assemblyId as string,
      campaign_id: campaign.id,
      member_id: r.member_id,
      to_address: address,
      status: result?.ok ? ("sent" as const) : ("failed" as const),
      provider_ref: result?.providerRef ?? null,
      cost: result?.cost ?? null,
      error: result?.error ?? null,
      sent_at: result?.ok ? new Date().toISOString() : null,
    };
  });

  await supabase.from("message_recipient").insert(recipientRows);

  await supabase
    .from("message_campaign")
    .update({
      status: failed === 0 ? "sent" : "sent",
      sent_at: new Date().toISOString(),
      delivered_count: sent,
      failed_count: failed,
      cost_total: cost,
      updated_by: ctx.userId,
    })
    .eq("id", campaign.id);

  return ok({ campaignId: campaign.id, sent, failed, cost, simulated: !configured });
}

export async function listCampaigns(ctx: AuthContext): Promise<Result<Campaign[]>> {
  requirePermission(ctx, "communication.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_campaign")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return ok(data ?? []);
}

/** Records an opt-out so future sends skip this member on this channel. */
export async function setConsent(
  ctx: AuthContext,
  memberId: string,
  channel: "sms" | "email",
  optedOut: boolean,
): Promise<Result<true>> {
  requirePermission(ctx, "member.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase.from("communication_consent").upsert(
    {
      assembly_id: ctx.assemblyId,
      member_id: memberId,
      channel,
      status: optedOut ? "opted_out" : "opted_in",
      updated_by: ctx.userId,
    },
    { onConflict: "member_id,channel" },
  );

  if (error) throw new Error(`Failed to update consent: ${error.message}`);
  return ok(true);
}
