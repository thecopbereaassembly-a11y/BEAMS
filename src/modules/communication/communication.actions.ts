"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import {
  campaignFormSchema,
  previewSend,
  sendCampaign,
  type SendPreview,
} from "./communication.module";

export interface CampaignState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
  preview?: SendPreview;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

function read(formData: FormData) {
  return {
    name: str(formData, "name"),
    channel: (str(formData, "channel") || "sms") as "sms" | "email",
    segment_key: str(formData, "segment_key"),
    subject: str(formData, "subject"),
    body: str(formData, "body"),
  };
}

/** Dry run — shows reach, opt-outs and estimated spend before committing. */
export async function previewCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const input = read(formData);
  if (!input.segment_key) return { fieldErrors: { segment_key: ["Choose who this goes to"] } };
  if (!input.body) return { fieldErrors: { body: ["Write a message"] } };

  try {
    const result = await previewSend(ctx, input.segment_key, input.channel, input.body);
    if (!result.ok) return { error: result.error.message };
    return { preview: result.data };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot send messages." };
    return { error: error instanceof Error ? error.message : "Could not preview." };
  }
}

export async function sendCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = campaignFormSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await sendCampaign(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };

    const { sent, failed, cost, simulated } = result.data;
    revalidatePath("/communication");

    return {
      success: simulated
        ? `Simulated ${sent} message${sent === 1 ? "" : "s"} — no SMS provider is configured, so nothing was actually delivered.`
        : `Sent to ${sent} recipient${sent === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}. Cost: GHS ${cost.toFixed(2)}.`,
    };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot send messages." };
    return { error: error instanceof Error ? error.message : "Could not send." };
  }
}
