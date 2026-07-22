import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import { absentees } from "@/modules/attendance/services/attendance.service";
import type {
  FollowupFormValues,
  ActivityFormValues,
  FollowupListQuery,
} from "../schemas/followup.schema";
import * as repo from "../repositories/followup.repository";
import type { Followup, FollowupEntry } from "../repositories/followup.repository";

export async function listFollowups(
  ctx: AuthContext,
  query: FollowupListQuery,
): Promise<Result<FollowupEntry[]>> {
  requirePermission(ctx, "shepherding.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listFollowups(ctx.assemblyId, query, ctx.memberId));
}

export async function getFollowup(
  ctx: AuthContext,
  followupId: string,
): Promise<Result<Followup>> {
  requirePermission(ctx, "shepherding.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const followup = await repo.findFollowupById(ctx.assemblyId, followupId);
  if (!followup) return err(AppError.notFound("Follow-up not found"));
  return ok(followup);
}

export async function getActivities(ctx: AuthContext, followupId: string) {
  requirePermission(ctx, "shepherding.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listActivities(ctx.assemblyId, followupId));
}

export async function createFollowup(
  ctx: AuthContext,
  values: FollowupFormValues,
): Promise<Result<Followup>> {
  requirePermission(ctx, "shepherding.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  return ok(
    await repo.insertFollowup({
      assembly_id: ctx.assemblyId,
      subject_member_id: values.subject_member_id ?? null,
      subject_visitor_id: values.subject_visitor_id ?? null,
      reason: values.reason,
      priority: values.priority,
      status: "open",
      due_on: values.due_on ?? null,
      outcome: values.notes ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }),
  );
}

/**
 * The absentee sweep (docs/13 §A4): finds members with no present/late mark
 * across the last N sessions and raises a follow-up for each.
 *
 * Deliberately skips anyone who already has an open follow-up for the same
 * reason — running it twice must not spam the queue.
 */
export async function generateAbsenteeFollowups(
  ctx: AuthContext,
  sessionCount = 4,
): Promise<Result<{ created: number; skipped: number }>> {
  requirePermission(ctx, "shepherding.write");
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const absenteeResult = await absentees(ctx, sessionCount);
  if (!absenteeResult.ok) return err(absenteeResult.error);

  const already = await repo.membersWithOpenFollowup(ctx.assemblyId, "absent_4_weeks");
  const fresh = absenteeResult.data.filter((id) => !already.has(id));

  const created = await repo.insertManyFollowups(
    fresh.map((memberId) => ({
      assembly_id: ctx.assemblyId as string,
      subject_member_id: memberId,
      reason: "absent_4_weeks",
      priority: "normal",
      status: "open",
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })),
  );

  return ok({ created, skipped: absenteeResult.data.length - fresh.length });
}

export async function assignShepherd(
  ctx: AuthContext,
  followupId: string,
  shepherdMemberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "shepherding.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.assignShepherd({
    assembly_id: ctx.assemblyId,
    followup_id: followupId,
    shepherd_member_id: shepherdMemberId,
    shepherd_user_id: ctx.userId,
    is_active: true,
    created_by: ctx.userId,
  });

  // Assigning moves it out of the untouched queue.
  await repo.updateFollowupRow(ctx.assemblyId, followupId, {
    status: "in_progress",
    updated_by: ctx.userId,
  });

  return ok(true);
}

export async function logActivity(
  ctx: AuthContext,
  followupId: string,
  values: ActivityFormValues,
): Promise<Result<true>> {
  requirePermission(ctx, "shepherding.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.insertActivity({
    assembly_id: ctx.assemblyId,
    followup_id: followupId,
    activity_type: values.activity_type,
    notes: values.notes ?? null,
    created_by: ctx.userId,
  });

  const followup = await repo.findFollowupById(ctx.assemblyId, followupId);
  if (followup?.status === "open") {
    await repo.updateFollowupRow(ctx.assemblyId, followupId, {
      status: "in_progress",
      updated_by: ctx.userId,
    });
  }

  return ok(true);
}

export async function closeFollowup(
  ctx: AuthContext,
  followupId: string,
  outcome: string | null,
): Promise<Result<true>> {
  requirePermission(ctx, "shepherding.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.updateFollowupRow(ctx.assemblyId, followupId, {
    status: "completed",
    closed_on: new Date().toISOString().slice(0, 10),
    outcome,
    updated_by: ctx.userId,
  });
  return ok(true);
}

/** Open + in-progress count, for the dashboard. */
export async function openFollowupCount(ctx: AuthContext): Promise<number> {
  if (!ctx.assemblyId) return 0;
  const rows = await repo.listFollowups(
    ctx.assemblyId,
    { status: "open", mine: "all" },
    ctx.memberId,
  );
  return rows.length;
}
