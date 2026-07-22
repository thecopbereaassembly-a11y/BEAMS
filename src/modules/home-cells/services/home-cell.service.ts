import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type {
  HomeCellFormValues,
  HomeCellListQuery,
  CellReportValues,
} from "../schemas/home-cell.schema";
import * as repo from "../repositories/home-cell.repository";
import type { HomeCell, RosterEntry, HomeCellReport } from "../repositories/home-cell.repository";

/** Cell health signal used on the list and dashboard. */
export function cellHealth(memberCount: number): {
  label: string;
  tone: "success" | "warning" | "neutral";
} {
  if (memberCount === 0) return { label: "Empty", tone: "warning" };
  if (memberCount < 4) return { label: "Small", tone: "neutral" };
  if (memberCount > 20) return { label: "Ready to multiply", tone: "success" };
  return { label: "Healthy", tone: "success" };
}

/** "Wednesday · 18:30" */
export function meetingSummary(cell: Pick<HomeCell, "meeting_day" | "meeting_time">): string {
  if (!cell.meeting_day && !cell.meeting_time) return "No schedule set";
  const time = cell.meeting_time?.slice(0, 5);
  return [cell.meeting_day, time].filter(Boolean).join(" · ");
}

function toRow(values: HomeCellFormValues) {
  return {
    name: values.name,
    code: values.code ?? null,
    leader_member_id: values.leader_member_id ?? null,
    assistant_member_id: values.assistant_member_id ?? null,
    meeting_day: values.meeting_day ?? null,
    meeting_time: values.meeting_time ?? null,
    location: values.location ?? null,
    gps_address: values.gps_address?.toUpperCase() ?? null,
    is_active: values.is_active,
  };
}

export async function listHomeCells(ctx: AuthContext, query: HomeCellListQuery) {
  requirePermission(ctx, "homecell.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const [{ rows, total }, counts] = await Promise.all([
    repo.listHomeCells(ctx.assemblyId, query),
    repo.countMembersPerCell(ctx.assemblyId),
  ]);

  return ok({
    rows: rows.map((cell) => ({ ...cell, memberCount: counts[cell.id] ?? 0 })),
    total,
  });
}

export async function getHomeCell(
  ctx: AuthContext,
  cellId: string,
): Promise<Result<HomeCell>> {
  requirePermission(ctx, "homecell.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const cell = await repo.findHomeCellById(ctx.assemblyId, cellId);
  if (!cell) return err(AppError.notFound("Home cell not found"));
  return ok(cell);
}

export async function getRoster(
  ctx: AuthContext,
  cellId: string,
): Promise<Result<RosterEntry[]>> {
  requirePermission(ctx, "homecell.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listCellRoster(ctx.assemblyId, cellId));
}

export async function getAssignableMembers(ctx: AuthContext, cellId: string) {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listAssignableMembers(ctx.assemblyId, cellId));
}

export async function createHomeCell(
  ctx: AuthContext,
  values: HomeCellFormValues,
): Promise<Result<HomeCell>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  return ok(
    await repo.insertHomeCell({
      ...toRow(values),
      assembly_id: ctx.assemblyId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }),
  );
}

export async function updateHomeCell(
  ctx: AuthContext,
  cellId: string,
  values: HomeCellFormValues,
): Promise<Result<HomeCell>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const existing = await repo.findHomeCellById(ctx.assemblyId, cellId);
  if (!existing) return err(AppError.notFound("Home cell not found"));

  return ok(
    await repo.updateHomeCellRow(ctx.assemblyId, cellId, {
      ...toRow(values),
      updated_by: ctx.userId,
    }),
  );
}

export async function deleteHomeCell(
  ctx: AuthContext,
  cellId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  await repo.softDeleteHomeCell(ctx.assemblyId, cellId, ctx.userId);
  return ok(true);
}

/**
 * Adding a member to a cell also updates member.home_cell_id — the cached
 * column the member list and dashboard read (docs/05 §6).
 */
export async function addMember(
  ctx: AuthContext,
  cellId: string,
  memberId: string,
  role: string,
): Promise<Result<true>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.addMemberToCell({
    assembly_id: ctx.assemblyId,
    home_cell_id: cellId,
    member_id: memberId,
    role,
    is_active: true,
    left_on: null,
    created_by: ctx.userId,
  });
  await repo.setMemberHomeCell(ctx.assemblyId, memberId, cellId);
  return ok(true);
}

export async function removeMember(
  ctx: AuthContext,
  cellId: string,
  memberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.removeMemberFromCell(ctx.assemblyId, cellId, memberId);
  await repo.setMemberHomeCell(ctx.assemblyId, memberId, null);
  return ok(true);
}

export async function getReports(
  ctx: AuthContext,
  cellId: string,
): Promise<Result<HomeCellReport[]>> {
  requirePermission(ctx, "homecell.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listCellReports(ctx.assemblyId, cellId));
}

export async function submitReport(
  ctx: AuthContext,
  cellId: string,
  values: CellReportValues,
): Promise<Result<HomeCellReport>> {
  requirePermission(ctx, "homecell.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  return ok(
    await repo.insertCellReport({
      assembly_id: ctx.assemblyId,
      home_cell_id: cellId,
      report_date: values.report_date,
      attendance_count: values.attendance_count,
      visitors_count: values.visitors_count,
      offering_amount: values.offering_amount,
      offering_currency: "GHS",
      testimonies: values.testimonies ?? null,
      prayer_points: values.prayer_points ?? null,
      absentees_note: values.absentees_note ?? null,
      followups_note: values.followups_note ?? null,
      submitted_by: ctx.memberId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }),
  );
}
