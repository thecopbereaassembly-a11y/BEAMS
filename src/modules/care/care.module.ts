import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { Tables } from "@/shared/types/database.types";

/**
 * CONFIDENTIAL CARE — Counselling and Welfare (docs/04 §10-11, ADR-010).
 *
 * These are the most sensitive records in the system. Three layers protect them:
 *   1. RLS requires an EXPLICIT counselling.read / welfare.read permission —
 *      being a member of the assembly is not enough (docs/schema/90 §confidential)
 *   2. requirePermission() here, so the app returns a clean 403 rather than an
 *      empty list that looks like "no cases"
 *   3. Database triggers write every mutation to activity_log (95_functions)
 *
 * Note the deliberate asymmetry: a caller without permission gets a *forbidden*
 * error, never silently-empty results — silence would be misleading.
 */

export type CounsellingCase = Tables<"counselling_case">;
export type WelfareCase = Tables<"welfare_case">;

export { CASE_STATUSES, CASE_STATUS_LABELS } from "./care.constants";
import { CASE_STATUSES } from "./care.constants";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const memberId = z.string().uuid("Select the member this case concerns");

// ── Counselling ─────────────────────────────────────────────────────────────

export const counsellingFormSchema = z.object({
  member_id: memberId,
  title: optionalText,
  category_id: optionalText,
  status: z.enum(CASE_STATUSES).default("open"),
});

export const counsellingSessionSchema = z.object({
  session_on: z.string().trim().min(1, "Session date is required"),
  location: optionalText,
  summary: optionalText,
  next_steps: optionalText,
});

export interface CaseEntry {
  id: string;
  case_no: string | null;
  title: string | null;
  status: string;
  opened_on: string;
  subjectName: string;
}

export async function listCounsellingCases(
  ctx: AuthContext,
): Promise<Result<CaseEntry[]>> {
  // Explicit permission required — this is the confidential gate.
  requirePermission(ctx, "counselling.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counselling_case")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("opened_on", { ascending: false });

  if (error) throw new Error(`Failed to load cases: ${error.message}`);
  return ok(await attachSubjects(data ?? []));
}

export async function createCounsellingCase(
  ctx: AuthContext,
  values: z.output<typeof counsellingFormSchema>,
): Promise<Result<CounsellingCase>> {
  requirePermission(ctx, "counselling.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counselling_case")
    .insert({
      assembly_id: ctx.assemblyId,
      member_id: values.member_id,
      title: values.title ?? null,
      status: values.status,
      opened_on: new Date().toISOString().slice(0, 10),
      assigned_counsellor_id: ctx.userId,
      is_confidential: true,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to open case: ${error.message}`);
  return ok(data);
}

export async function getCounsellingCase(
  ctx: AuthContext,
  caseId: string,
): Promise<Result<CounsellingCase>> {
  requirePermission(ctx, "counselling.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counselling_case")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load case: ${error.message}`);
  if (!data) return err(AppError.notFound("Case not found"));
  return ok(data);
}

export async function listSessions(ctx: AuthContext, caseId: string) {
  requirePermission(ctx, "counselling.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("counselling_session")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .order("session_on", { ascending: false });

  if (error) throw new Error(`Failed to load sessions: ${error.message}`);
  return ok(data ?? []);
}

export async function addSession(
  ctx: AuthContext,
  caseId: string,
  values: z.output<typeof counsellingSessionSchema>,
): Promise<Result<true>> {
  requirePermission(ctx, "counselling.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase.from("counselling_session").insert({
    assembly_id: ctx.assemblyId,
    case_id: caseId,
    session_on: new Date(values.session_on).toISOString(),
    location: values.location ?? null,
    counsellor_id: ctx.userId,
    summary: values.summary ?? null,
    next_steps: values.next_steps ?? null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  if (error) throw new Error(`Failed to record session: ${error.message}`);
  return ok(true);
}

// ── Welfare ─────────────────────────────────────────────────────────────────

export const welfareFormSchema = z.object({
  member_id: memberId,
  title: z.string().trim().min(1, "Describe the need"),
  description: optionalText,
  amount_requested: z.coerce.number().min(0, "Cannot be negative").optional(),
  status: z.enum(CASE_STATUSES).default("open"),
});

export async function listWelfareCases(ctx: AuthContext): Promise<Result<CaseEntry[]>> {
  requirePermission(ctx, "welfare.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("welfare_case")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .order("requested_on", { ascending: false });

  if (error) throw new Error(`Failed to load welfare cases: ${error.message}`);

  const entries = await attachSubjects(
    (data ?? []).map((c) => ({ ...c, opened_on: c.requested_on })),
  );
  return ok(entries);
}

export async function createWelfareCase(
  ctx: AuthContext,
  values: z.output<typeof welfareFormSchema>,
): Promise<Result<WelfareCase>> {
  requirePermission(ctx, "welfare.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("welfare_case")
    .insert({
      assembly_id: ctx.assemblyId,
      member_id: values.member_id,
      title: values.title,
      description: values.description ?? null,
      amount_requested: values.amount_requested ?? null,
      currency: "GHS",
      status: values.status,
      requested_on: new Date().toISOString().slice(0, 10),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to open welfare case: ${error.message}`);
  return ok(data);
}

export async function getWelfareCase(
  ctx: AuthContext,
  caseId: string,
): Promise<Result<WelfareCase>> {
  requirePermission(ctx, "welfare.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("welfare_case")
    .select("*")
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", caseId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load case: ${error.message}`);
  if (!data) return err(AppError.notFound("Case not found"));
  return ok(data);
}

/**
 * Approving a welfare case is a money decision, so it is recorded with who
 * approved it and when — the audit trigger captures the before/after.
 */
export async function approveWelfare(
  ctx: AuthContext,
  caseId: string,
  amount: number,
): Promise<Result<true>> {
  requirePermission(ctx, "welfare.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("welfare_case")
    .update({
      amount_approved: amount,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      status: "in_progress",
      updated_by: ctx.userId,
    })
    .eq("assembly_id", ctx.assemblyId)
    .eq("id", caseId);

  if (error) throw new Error(`Failed to approve: ${error.message}`);
  return ok(true);
}

// ── shared ──────────────────────────────────────────────────────────────────

async function attachSubjects(
  cases: { id: string; case_no: string | null; title: string | null; status: string; opened_on: string; member_id: string | null }[],
): Promise<CaseEntry[]> {
  if (cases.length === 0) return [];

  const supabase = await createClient();
  const memberIds = cases.map((c) => c.member_id).filter(Boolean) as string[];
  const { data: members } = memberIds.length
    ? await supabase
        .from("member")
        .select("id, first_name, last_name, preferred_name")
        .in("id", memberIds)
    : { data: [] };

  const byId = new Map((members ?? []).map((m) => [m.id, m]));

  return cases.map((c) => {
    const member = c.member_id ? byId.get(c.member_id) : null;
    return {
      id: c.id,
      case_no: c.case_no,
      title: c.title,
      status: c.status,
      opened_on: c.opened_on,
      subjectName: member
        ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
        : "Unknown",
    };
  });
}
