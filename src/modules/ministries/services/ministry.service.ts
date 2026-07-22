import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { MinistryFormValues, MinistryListQuery } from "../schemas/ministry.schema";
import * as repo from "../repositories/ministry.repository";
import type { Ministry, MinistryRosterEntry } from "../repositories/ministry.repository";

function toRow(values: MinistryFormValues) {
  return {
    name: values.name,
    code: values.code?.toUpperCase() ?? null,
    category: values.category,
    description: values.description ?? null,
    leader_member_id: values.leader_member_id ?? null,
    is_active: values.is_active,
  };
}

export async function listMinistries(ctx: AuthContext, query: MinistryListQuery) {
  requirePermission(ctx, "ministry.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const [{ rows, total }, counts] = await Promise.all([
    repo.listMinistries(ctx.assemblyId, query),
    repo.countMembersPerMinistry(ctx.assemblyId),
  ]);

  return ok({
    rows: rows.map((m) => ({ ...m, memberCount: counts[m.id] ?? 0 })),
    total,
  });
}

export async function getMinistry(
  ctx: AuthContext,
  ministryId: string,
): Promise<Result<Ministry>> {
  requirePermission(ctx, "ministry.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const ministry = await repo.findMinistryById(ctx.assemblyId, ministryId);
  if (!ministry) return err(AppError.notFound("Ministry not found"));
  return ok(ministry);
}

export async function getRoster(
  ctx: AuthContext,
  ministryId: string,
): Promise<Result<MinistryRosterEntry[]>> {
  requirePermission(ctx, "ministry.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listMinistryRoster(ctx.assemblyId, ministryId));
}

export async function getAssignableMembers(ctx: AuthContext, ministryId: string) {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listAssignableMembers(ctx.assemblyId, ministryId));
}

export async function createMinistry(
  ctx: AuthContext,
  values: MinistryFormValues,
): Promise<Result<Ministry>> {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  return ok(
    await repo.insertMinistry({
      ...toRow(values),
      assembly_id: ctx.assemblyId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }),
  );
}

export async function updateMinistry(
  ctx: AuthContext,
  ministryId: string,
  values: MinistryFormValues,
): Promise<Result<Ministry>> {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const existing = await repo.findMinistryById(ctx.assemblyId, ministryId);
  if (!existing) return err(AppError.notFound("Ministry not found"));

  return ok(
    await repo.updateMinistryRow(ctx.assemblyId, ministryId, {
      ...toRow(values),
      updated_by: ctx.userId,
    }),
  );
}

export async function deleteMinistry(
  ctx: AuthContext,
  ministryId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  await repo.softDeleteMinistry(ctx.assemblyId, ministryId, ctx.userId);
  return ok(true);
}

export async function addMember(
  ctx: AuthContext,
  ministryId: string,
  memberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.addMemberToMinistry({
    assembly_id: ctx.assemblyId,
    ministry_id: ministryId,
    member_id: memberId,
    is_active: true,
    left_on: null,
    created_by: ctx.userId,
  });
  return ok(true);
}

export async function removeMember(
  ctx: AuthContext,
  ministryId: string,
  memberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "ministry.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  await repo.removeMemberFromMinistry(ctx.assemblyId, ministryId, memberId);
  return ok(true);
}

/** Used by the member profile to show ministry involvement. */
export async function ministriesForMember(
  ctx: AuthContext,
  memberId: string,
): Promise<Result<Ministry[]>> {
  requirePermission(ctx, "ministry.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listMinistriesForMember(ctx.assemblyId, memberId));
}
