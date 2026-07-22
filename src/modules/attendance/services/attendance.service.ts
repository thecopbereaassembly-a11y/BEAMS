import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type {
  SessionFormValues,
  AttendanceMark,
  HeadcountValues,
} from "../schemas/attendance.schema";
import * as repo from "../repositories/attendance.repository";
import type { AttendanceSession } from "../repositories/attendance.repository";

/** Attendance rate as a whole percentage. */
export function attendanceRate(present: number, roster: number): number {
  if (roster <= 0) return 0;
  return Math.round((present / roster) * 100);
}

/** Present + late both count as attending. */
export function countedPresent(statuses: string[]): number {
  return statuses.filter((s) => s === "present" || s === "late").length;
}

export async function getServiceTypes(ctx: AuthContext) {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listServiceTypes(ctx.assemblyId));
}

export async function getSessions(ctx: AuthContext) {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listSessions(ctx.assemblyId));
}

export async function getSession(
  ctx: AuthContext,
  sessionId: string,
): Promise<Result<AttendanceSession>> {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const session = await repo.findSessionById(ctx.assemblyId, sessionId);
  if (!session) return err(AppError.notFound("Session not found"));
  return ok(session);
}

export async function createSession(
  ctx: AuthContext,
  values: SessionFormValues,
): Promise<Result<AttendanceSession>> {
  requirePermission(ctx, "attendance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  try {
    return ok(
      await repo.insertSession({
        assembly_id: ctx.assemblyId,
        service_type_id: values.service_type_id,
        service_date: values.service_date,
        title: values.title ?? null,
        status: "open",
        created_by: ctx.userId,
        updated_by: ctx.userId,
      }),
    );
  } catch (error) {
    // Unique (assembly, service_type, date) — a session already exists.
    if (error instanceof Error && /duplicate key/i.test(error.message)) {
      return err(
        new AppError(
          "conflict",
          "A session for that service and date already exists.",
        ),
      );
    }
    throw error;
  }
}

export async function getCaptureData(ctx: AuthContext, sessionId: string) {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const [roster, marks, headcounts] = await Promise.all([
    repo.listRosterForCapture(ctx.assemblyId),
    repo.listSessionMarks(ctx.assemblyId, sessionId),
    repo.listHeadcounts(ctx.assemblyId, sessionId),
  ]);

  return ok({ roster, marks, headcounts });
}

/**
 * Save a batch of attendance marks. Idempotent by (session_id, member_id), so
 * replaying the offline queue after reconnect is always safe.
 */
export async function saveMarks(
  ctx: AuthContext,
  marks: AttendanceMark[],
): Promise<Result<number>> {
  requirePermission(ctx, "attendance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.upsertMarks(ctx.assemblyId, marks, ctx.userId));
}

export async function saveHeadcount(
  ctx: AuthContext,
  values: HeadcountValues,
): Promise<Result<true>> {
  requirePermission(ctx, "attendance.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.upsertHeadcount({
    assembly_id: ctx.assemblyId,
    session_id: values.session_id,
    category: values.category,
    headcount: values.headcount,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });
  return ok(true);
}

export async function memberAttendance(ctx: AuthContext, memberId: string) {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listMemberAttendance(ctx.assemblyId, memberId));
}

export async function absentees(ctx: AuthContext, sessionCount = 4) {
  requirePermission(ctx, "attendance.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.findAbsentees(ctx.assemblyId, sessionCount));
}
