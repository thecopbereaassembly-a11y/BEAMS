import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/** Church asset register (docs/04 §18). */

export type Asset = Tables<"asset">;

export const CONDITIONS = ["new", "good", "fair", "poor", "damaged", "disposed"] as const;

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const assetFormSchema = z.object({
  name: z.string().trim().min(1, "What is the item?").max(160),
  tag_no: optionalText,
  category_id: optionalText,
  description: optionalText,
  serial_no: optionalText,
  location: optionalText,
  condition: z.enum(CONDITIONS).default("good"),
  quantity: z.coerce.number().int().min(1, "At least 1").default(1),
  acquired_on: optionalText,
  acquisition_cost: z.coerce.number().min(0).optional(),
});

export type AssetFormValues = z.output<typeof assetFormSchema>;

export const maintenanceFormSchema = z.object({
  asset_id: z.string().uuid(),
  maintained_on: z.string().trim().min(1, "Date is required"),
  description: z.string().trim().min(1, "What was done?"),
  cost: z.coerce.number().min(0).optional(),
  performed_by: optionalText,
});

export interface AssetEntry extends Asset {
  categoryName: string | null;
}

export async function listAssets(ctx: AuthContext): Promise<Result<AssetEntry[]>> {
  requirePermission(ctx, "asset.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const [{ data, error }, { data: categories }] = await Promise.all([
    supabase
      .from("asset")
      .select("*")
      .eq("assembly_id", ctx.assemblyId)
      .is("deleted_at", null)
      .order("name"),
    supabase.from("asset_category").select("id, name").eq("assembly_id", ctx.assemblyId),
  ]);

  if (error) throw new Error(`Failed to load assets: ${error.message}`);
  const byId = new Map((categories ?? []).map((c) => [c.id, c.name]));

  return ok(
    (data ?? []).map((a) => ({
      ...a,
      categoryName: a.category_id ? (byId.get(a.category_id) ?? null) : null,
    })),
  );
}

export async function getCategories(ctx: AuthContext) {
  requirePermission(ctx, "asset.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data } = await supabase
    .from("asset_category")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .order("name");

  if (data?.length) return ok(data);

  // Seed sensible defaults on first use.
  const defaults = ["Instruments", "Furniture", "Sound & Media", "IT Equipment", "Vehicles", "Building"];
  const { data: seeded } = await supabase
    .from("asset_category")
    .insert(defaults.map((name) => ({ assembly_id: ctx.assemblyId as string, name })))
    .select("*");

  return ok(seeded ?? []);
}

export async function createAsset(
  ctx: AuthContext,
  values: AssetFormValues,
): Promise<Result<string>> {
  requirePermission(ctx, "asset.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset")
    .insert({
      assembly_id: ctx.assemblyId,
      name: values.name,
      tag_no: values.tag_no ?? null,
      category_id: values.category_id ?? null,
      description: values.description ?? null,
      serial_no: values.serial_no ?? null,
      location: values.location ?? null,
      condition: values.condition,
      quantity: values.quantity,
      acquired_on: values.acquired_on ?? null,
      acquisition_cost: values.acquisition_cost ?? null,
      currency: "GHS",
      is_active: true,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return err(new AppError("conflict", "That asset tag is already in use."));
    }
    throw new Error(`Failed to add asset: ${error.message}`);
  }
  return ok(data.id);
}

export async function logMaintenance(
  ctx: AuthContext,
  values: z.output<typeof maintenanceFormSchema>,
): Promise<Result<true>> {
  requirePermission(ctx, "asset.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase.from("asset_maintenance").insert({
    assembly_id: ctx.assemblyId,
    asset_id: values.asset_id,
    maintained_on: values.maintained_on,
    description: values.description,
    cost: values.cost ?? null,
    currency: "GHS",
    performed_by: values.performed_by ?? null,
    created_by: ctx.userId,
  });

  if (error) throw new Error(`Failed to log maintenance: ${error.message}`);
  return ok(true);
}

/** Total book value of the register, for the summary tile. */
export function totalValue(assets: Asset[]): number {
  return assets.reduce(
    (sum, a) => sum + Number(a.acquisition_cost ?? 0) * (a.quantity ?? 1),
    0,
  );
}
