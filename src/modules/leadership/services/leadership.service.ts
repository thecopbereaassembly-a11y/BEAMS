import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { AppointmentFormValues } from "../schemas/leadership.schema";
import * as repo from "../repositories/leadership.repository";
import type { AppointmentEntry, LeadershipPosition } from "../repositories/leadership.repository";

export async function getPositions(
  ctx: AuthContext,
): Promise<Result<LeadershipPosition[]>> {
  requirePermission(ctx, "leadership.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listPositions(ctx.assemblyId));
}

export async function getAppointments(
  ctx: AuthContext,
  currentOnly = true,
): Promise<Result<AppointmentEntry[]>> {
  requirePermission(ctx, "leadership.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listAppointments(ctx.assemblyId, currentOnly));
}

export async function appointOfficer(
  ctx: AuthContext,
  values: AppointmentFormValues,
): Promise<Result<true>> {
  requirePermission(ctx, "leadership.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.insertAppointment({
    assembly_id: ctx.assemblyId,
    member_id: values.member_id,
    position_id: values.position_id,
    portfolio: values.portfolio ?? null,
    appointed_on: values.appointed_on ?? null,
    ordained_on: values.ordained_on ?? null,
    is_current: true,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  return ok(true);
}

export async function endAppointment(
  ctx: AuthContext,
  appointmentId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "leadership.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  await repo.endAppointment(ctx.assemblyId, appointmentId, ctx.userId);
  return ok(true);
}

/** Offices held by a member — used on the member profile. */
export async function officesForMember(ctx: AuthContext, memberId: string) {
  requirePermission(ctx, "leadership.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listAppointmentsForMember(ctx.assemblyId, memberId));
}
