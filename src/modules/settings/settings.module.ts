import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/**
 * Settings / reference data (docs/04 §20).
 *
 * Managed with the service role after the appropriate app-level permission
 * check, scoped to the assembly in code. The permission split respects what the
 * data IS: assembly profile & service types → settings.write; funds &
 * contribution types are financial → finance.write.
 */

export type Assembly = Tables<"assembly">;
export type Fund = Tables<"fund">;
export type ContributionType = Tables<"contribution_type">;
export type ServiceType = Tables<"service_type">;

// ── Assembly profile ─────────────────────────────────────────────────────────

export const assemblyProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  short_name: z.string().trim().max(60).optional().or(z.literal("")),
  address_line: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});

export async function getAssembly(ctx: AuthContext): Promise<Result<Assembly>> {
  requirePermission(ctx, "settings.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { data, error } = await admin.from("assembly").select("*").eq("id", ctx.assemblyId).maybeSingle();
  if (error) throw new Error(`Failed to load assembly: ${error.message}`);
  if (!data) return err(AppError.notFound("Assembly not found"));
  return ok(data);
}

export async function updateAssemblyProfile(
  ctx: AuthContext,
  values: z.output<typeof assemblyProfileSchema>,
): Promise<Result<true>> {
  requirePermission(ctx, "settings.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const clean = (v?: string) => (v && v.trim() !== "" ? v.trim() : null);
  const { error } = await admin
    .from("assembly")
    .update({
      name: values.name,
      short_name: clean(values.short_name),
      address_line: clean(values.address_line),
      city: clean(values.city),
      phone: clean(values.phone),
      email: clean(values.email),
      updated_by: ctx.userId,
    })
    .eq("id", ctx.assemblyId);
  if (error) throw new Error(`Failed to save: ${error.message}`);
  return ok(true);
}

// ── Funds (finance.write) ─────────────────────────────────────────────────────

export async function listFunds(ctx: AuthContext): Promise<Result<Fund[]>> {
  requirePermission(ctx, "settings.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { data, error } = await admin.from("fund").select("*").eq("assembly_id", ctx.assemblyId).is("deleted_at", null).order("name");
  if (error) throw new Error(`Failed to load funds: ${error.message}`);
  return ok(data ?? []);
}

export async function addFund(ctx: AuthContext, name: string): Promise<Result<true>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const trimmed = name.trim();
  if (!trimmed) return err(new AppError("validation", "Enter a fund name."));
  const admin = createAdminClient();
  const { error } = await admin.from("fund").insert({ assembly_id: ctx.assemblyId, name: trimmed, created_by: ctx.userId, updated_by: ctx.userId });
  if (error) {
    if (/duplicate key/i.test(error.message)) return err(new AppError("conflict", "That fund already exists."));
    throw new Error(error.message);
  }
  return ok(true);
}

export async function setFundActive(ctx: AuthContext, id: string, active: boolean): Promise<Result<true>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { error } = await admin.from("fund").update({ is_active: active, updated_by: ctx.userId }).eq("assembly_id", ctx.assemblyId).eq("id", id);
  if (error) throw new Error(error.message);
  return ok(true);
}

// ── Contribution types (finance.write) ────────────────────────────────────────

export async function listContributionTypes(ctx: AuthContext): Promise<Result<ContributionType[]>> {
  requirePermission(ctx, "settings.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { data, error } = await admin.from("contribution_type").select("*").eq("assembly_id", ctx.assemblyId).order("name");
  if (error) throw new Error(`Failed to load giving types: ${error.message}`);
  return ok(data ?? []);
}

export async function addContributionType(ctx: AuthContext, name: string): Promise<Result<true>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const trimmed = name.trim();
  if (!trimmed) return err(new AppError("validation", "Enter a name."));
  const admin = createAdminClient();
  const { error } = await admin.from("contribution_type").insert({ assembly_id: ctx.assemblyId, name: trimmed });
  if (error) {
    if (/duplicate key/i.test(error.message)) return err(new AppError("conflict", "That giving type already exists."));
    throw new Error(error.message);
  }
  return ok(true);
}

export async function setContributionTypeActive(ctx: AuthContext, id: string, active: boolean): Promise<Result<true>> {
  requirePermission(ctx, "finance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { error } = await admin.from("contribution_type").update({ is_active: active }).eq("assembly_id", ctx.assemblyId).eq("id", id);
  if (error) throw new Error(error.message);
  return ok(true);
}

// ── Service types (settings.write) ────────────────────────────────────────────

export const serviceTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  default_day: z.string().trim().optional().or(z.literal("")),
  default_time: z.string().trim().optional().or(z.literal("")),
});

export async function listServiceTypes(ctx: AuthContext): Promise<Result<ServiceType[]>> {
  requirePermission(ctx, "settings.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const { data, error } = await admin.from("service_type").select("*").eq("assembly_id", ctx.assemblyId).order("name");
  if (error) throw new Error(`Failed to load service types: ${error.message}`);
  return ok(data ?? []);
}

export async function saveServiceType(
  ctx: AuthContext,
  values: z.output<typeof serviceTypeSchema>,
  id?: string,
): Promise<Result<true>> {
  requirePermission(ctx, "settings.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  const admin = createAdminClient();
  const row = {
    name: values.name,
    default_day: values.default_day && values.default_day !== "" ? values.default_day : null,
    default_time: values.default_time && values.default_time !== "" ? values.default_time : null,
  };
  if (id) {
    const { error } = await admin.from("service_type").update(row).eq("assembly_id", ctx.assemblyId).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("service_type").insert({ ...row, assembly_id: ctx.assemblyId });
    if (error) {
      if (/duplicate key/i.test(error.message)) return err(new AppError("conflict", "That service already exists."));
      throw new Error(error.message);
    }
  }
  return ok(true);
}
