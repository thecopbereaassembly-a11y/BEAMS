import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import { createClient } from "@/lib/supabase/server";
import type { VisitorFormValues, VisitorListQuery } from "../schemas/visitor.schema";
import * as repo from "../repositories/visitor.repository";
import type { Visitor } from "../repositories/visitor.repository";

export function visitorName(v: Pick<Visitor, "first_name" | "last_name">): string {
  return [v.first_name, v.last_name].filter(Boolean).join(" ");
}

function normalizePhone(input?: string): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+233")) return digits;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return digits || null;
}

export async function listVisitors(ctx: AuthContext, query: VisitorListQuery) {
  requirePermission(ctx, "visitor.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listVisitors(ctx.assemblyId, query));
}

export async function getVisitor(
  ctx: AuthContext,
  visitorId: string,
): Promise<Result<Visitor>> {
  requirePermission(ctx, "visitor.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const visitor = await repo.findVisitorById(ctx.assemblyId, visitorId);
  if (!visitor) return err(AppError.notFound("Visitor not found"));
  return ok(visitor);
}

export async function getSources(ctx: AuthContext) {
  requirePermission(ctx, "visitor.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.ensureDefaultSources(ctx.assemblyId));
}

export async function createVisitor(
  ctx: AuthContext,
  values: VisitorFormValues,
): Promise<Result<Visitor>> {
  requirePermission(ctx, "visitor.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const firstVisit = values.first_visit_on ?? new Date().toISOString().slice(0, 10);

  const visitor = await repo.insertVisitor({
    assembly_id: ctx.assemblyId,
    first_name: values.first_name,
    last_name: values.last_name ?? null,
    gender: values.gender ?? null,
    phone: normalizePhone(values.phone),
    email: values.email ?? null,
    address: values.address ?? null,
    source_id: values.source_id ?? null,
    invited_by_member_id: values.invited_by_member_id ?? null,
    first_visit_on: firstVisit,
    visit_count: 1,
    notes: values.notes ?? null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  await repo.recordVisit({
    assembly_id: ctx.assemblyId,
    visitor_id: visitor.id,
    visited_on: firstVisit,
    created_by: ctx.userId,
  });

  return ok(visitor);
}

/** Logs a repeat visit and bumps the counter. */
export async function logReturnVisit(
  ctx: AuthContext,
  visitorId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "visitor.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const visitor = await repo.findVisitorById(ctx.assemblyId, visitorId);
  if (!visitor) return err(AppError.notFound("Visitor not found"));

  await repo.recordVisit({
    assembly_id: ctx.assemblyId,
    visitor_id: visitorId,
    visited_on: new Date().toISOString().slice(0, 10),
    created_by: ctx.userId,
  });
  await repo.updateVisitorRow(ctx.assemblyId, visitorId, {
    visit_count: (visitor.visit_count ?? 0) + 1,
    updated_by: ctx.userId,
  });

  return ok(true);
}

export async function getVisits(ctx: AuthContext, visitorId: string) {
  requirePermission(ctx, "visitor.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listVisits(ctx.assemblyId, visitorId));
}

/**
 * Converts a visitor into a full member, linking both records so the visitor
 * history is preserved rather than lost (docs/04 §7).
 */
export async function convertToMember(
  ctx: AuthContext,
  visitorId: string,
): Promise<Result<string>> {
  requirePermission(ctx, "visitor.write");
  requirePermission(ctx, "member.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const visitor = await repo.findVisitorById(ctx.assemblyId, visitorId);
  if (!visitor) return err(AppError.notFound("Visitor not found"));
  if (visitor.is_converted && visitor.converted_member_id) {
    return ok(visitor.converted_member_id);
  }

  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("member")
    .insert({
      assembly_id: ctx.assemblyId,
      first_name: visitor.first_name,
      last_name: visitor.last_name || visitor.first_name,
      gender: visitor.gender,
      primary_phone: visitor.phone,
      primary_email: visitor.email,
      residential_address: visitor.address,
      current_status: "new_convert",
      joined_on: new Date().toISOString().slice(0, 10),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create member: ${error.message}`);

  await supabase.from("membership_status_history").insert({
    assembly_id: ctx.assemblyId,
    member_id: member.id,
    status: "new_convert",
    reason: "Converted from visitor",
    created_by: ctx.userId,
  });

  await repo.updateVisitorRow(ctx.assemblyId, visitorId, {
    is_converted: true,
    converted_member_id: member.id,
    converted_on: new Date().toISOString().slice(0, 10),
    updated_by: ctx.userId,
  });

  return ok(member.id);
}
