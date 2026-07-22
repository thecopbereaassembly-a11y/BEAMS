import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/**
 * Evangelism (docs/04 §12). Souls won feed the Shepherding follow-up engine so
 * a new convert is contacted rather than recorded and forgotten.
 */

export type EvangelismProgram = Tables<"evangelism_program">;
export type SoulWon = Tables<"soul_won">;

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const programFormSchema = z.object({
  name: z.string().trim().min(1, "Name the outreach").max(160),
  description: optionalText,
  location: optionalText,
  starts_on: optionalText,
  ends_on: optionalText,
  target_souls: z.coerce.number().int().min(0).optional(),
});

export const soulFormSchema = z.object({
  program_id: optionalText,
  full_name: z.string().trim().min(1, "Who responded?").max(160),
  gender: z.enum(["male", "female"]).optional(),
  phone: optionalText,
  address: optionalText,
  decision: z.enum(["first_time", "rededication"]).default("first_time"),
  won_on: z.string().trim().min(1, "Date is required"),
  won_by_member_id: optionalText,
  /** Raise a shepherding follow-up so this person is actually contacted. */
  create_followup: z.coerce.boolean().default(true),
});

export type SoulFormValues = z.output<typeof soulFormSchema>;

export async function listPrograms(ctx: AuthContext): Promise<Result<EvangelismProgram[]>> {
  requirePermission(ctx, "evangelism.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evangelism_program")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("starts_on", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`Failed to load programs: ${error.message}`);
  return ok(data ?? []);
}

export async function listSouls(ctx: AuthContext): Promise<Result<SoulWon[]>> {
  requirePermission(ctx, "evangelism.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soul_won")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("won_on", { ascending: false });

  if (error) throw new Error(`Failed to load souls won: ${error.message}`);
  return ok(data ?? []);
}

export async function createProgram(
  ctx: AuthContext,
  values: z.output<typeof programFormSchema>,
): Promise<Result<string>> {
  requirePermission(ctx, "evangelism.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evangelism_program")
    .insert({
      assembly_id: ctx.assemblyId,
      name: values.name,
      description: values.description ?? null,
      location: values.location ?? null,
      starts_on: values.starts_on ?? null,
      ends_on: values.ends_on ?? null,
      target_souls: values.target_souls ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create program: ${error.message}`);
  return ok(data.id);
}

/**
 * Records a soul won and — by default — raises a follow-up. The whole point of
 * recording a decision is that someone visits afterwards.
 */
export async function recordSoul(
  ctx: AuthContext,
  values: SoulFormValues,
): Promise<Result<{ soulId: string; followupCreated: boolean }>> {
  requirePermission(ctx, "evangelism.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data: soul, error } = await supabase
    .from("soul_won")
    .insert({
      assembly_id: ctx.assemblyId,
      program_id: values.program_id ?? null,
      full_name: values.full_name,
      gender: values.gender ?? null,
      phone: values.phone ?? null,
      address: values.address ?? null,
      decision: values.decision,
      won_on: values.won_on,
      won_by_member_id: values.won_by_member_id ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to record: ${error.message}`);

  let followupCreated = false;
  if (values.create_followup) {
    // A visitor record gives the follow-up a subject and keeps the pipeline
    // consistent with how new visitors are handled.
    const { data: visitor } = await supabase
      .from("visitor")
      .insert({
        assembly_id: ctx.assemblyId,
        first_name: values.full_name.split(/\s+/)[0] ?? values.full_name,
        last_name: values.full_name.split(/\s+/).slice(1).join(" ") || null,
        gender: values.gender ?? null,
        phone: values.phone ?? null,
        address: values.address ?? null,
        first_visit_on: values.won_on,
        visit_count: 1,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();

    if (visitor) {
      await supabase.from("soul_won").update({ visitor_id: visitor.id }).eq("id", soul.id);

      const { error: fuErr } = await supabase.from("followup").insert({
        assembly_id: ctx.assemblyId,
        subject_visitor_id: visitor.id,
        reason: "new_convert",
        priority: "high",
        status: "open",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      });
      followupCreated = !fuErr;
    }
  }

  return ok({ soulId: soul.id, followupCreated });
}
