"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { assetFormSchema, maintenanceFormSchema, createAsset, logMaintenance } from "./assets.module";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function createAssetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = assetFormSchema.safeParse({
    name: str(formData, "name"),
    tag_no: str(formData, "tag_no"),
    category_id: str(formData, "category_id"),
    description: str(formData, "description"),
    serial_no: str(formData, "serial_no"),
    location: str(formData, "location"),
    condition: str(formData, "condition") || "good",
    quantity: str(formData, "quantity") || 1,
    acquired_on: str(formData, "acquired_on"),
    acquisition_cost: str(formData, "acquisition_cost") || undefined,
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await createAsset(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: "You cannot manage assets." };
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/assets");
  return { success: "Asset added to the register." };
}

export async function logMaintenanceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired." };

  const parsed = maintenanceFormSchema.safeParse({
    asset_id: str(formData, "asset_id"),
    maintained_on: str(formData, "maintained_on"),
    description: str(formData, "description"),
    cost: str(formData, "cost") || undefined,
    performed_by: str(formData, "performed_by"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  try {
    const result = await logMaintenance(ctx, parsed.data);
    if (!result.ok) return { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save." };
  }

  revalidatePath("/assets");
  return { success: "Maintenance recorded." };
}
