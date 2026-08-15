import "server-only";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import type { MemberFormValues, MemberListQuery } from "../schemas/member.schema";
import * as repo from "../repositories/member.repository";
import type { Member } from "../repositories/member.repository";

/**
 * Membership business rules. Framework-agnostic: no React, no Next — so it can
 * be unit-tested directly (docs/03 §3). Permission checks happen here as well
 * as in RLS: belt and braces.
 */

/** Normalize Ghana phone numbers to +233XXXXXXXXX for consistent storage/search. */
export function normalizeGhanaPhone(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+233")) return digits;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  return digits || undefined;
}

/** "Kwame Mensah" or the preferred name when set. */
export function displayName(member: Pick<Member, "first_name" | "last_name" | "preferred_name">): string {
  return member.preferred_name?.trim()
    ? `${member.preferred_name} ${member.last_name}`
    : `${member.first_name} ${member.last_name}`;
}

/** Age in whole years, or null when no date of birth is recorded. */
export function ageFrom(dateOfBirth: string | null, now = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function toRow(values: MemberFormValues) {
  return {
    first_name: values.first_name,
    middle_name: values.middle_name ?? null,
    last_name: values.last_name,
    preferred_name: values.preferred_name ?? null,
    gender: values.gender ?? null,
    date_of_birth: values.date_of_birth ?? null,
    marital_status: values.marital_status ?? null,
    wedding_anniversary: values.wedding_anniversary ?? null,
    primary_phone: normalizeGhanaPhone(values.primary_phone) ?? null,
    primary_email: values.primary_email ?? null,
    residential_address: values.residential_address ?? null,
    gps_address: values.gps_address?.toUpperCase() ?? null,
    landmark: values.landmark ?? null,
    current_status: values.current_status,
    joined_on: values.joined_on ?? null,
    home_cell_id: values.home_cell_id ?? null,
    is_water_baptized: values.is_water_baptized,
    is_holy_spirit_baptized: values.is_holy_spirit_baptized,
    notes_summary: values.notes_summary ?? null,
  };
}

export async function listMembers(
  ctx: AuthContext,
  query: MemberListQuery,
): Promise<Result<repo.ListResult>> {
  requirePermission(ctx, "member.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.listMembers(ctx.assemblyId, query));
}

export async function getMember(
  ctx: AuthContext,
  memberId: string,
): Promise<Result<Member>> {
  requirePermission(ctx, "member.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const member = await repo.findMemberById(ctx.assemblyId, memberId);
  if (!member) return err(AppError.notFound("Member not found"));
  return ok(member);
}

export async function createMember(
  ctx: AuthContext,
  values: MemberFormValues,
): Promise<Result<Member>> {
  requirePermission(ctx, "member.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const member = await repo.insertMember({
    ...toRow(values),
    assembly_id: ctx.assemblyId,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  });

  // Status history is the source of truth for lifecycle reporting (ADR-007).
  await repo.insertStatusHistory({
    assembly_id: ctx.assemblyId,
    member_id: member.id,
    status: values.current_status,
    reason: "Member created",
    created_by: ctx.userId,
  });

  return ok(member);
}

export interface ImportOutcome {
  inserted: number;
  skipped: number;
  skippedDetail: { name: string; reason: string }[];
}

/**
 * Bulk-insert already-validated rows (see import.service.parseMemberWorkbook).
 * Duplicates are SKIPPED rather than errored, so re-running a partly-imported
 * file is safe: a row is a duplicate if its Member No, phone, or email already
 * exists in the assembly — or repeats earlier in the same file. Each insert
 * still writes its status-history row, exactly like a single add.
 */
export async function importMembers(
  ctx: AuthContext,
  rows: (MemberFormValues & { member_no?: string })[],
): Promise<Result<ImportOutcome>> {
  requirePermission(ctx, "member.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const existing = await repo.listMemberIdentifiers(ctx.assemblyId);
  const seenNos = new Set(existing.map((m) => m.member_no?.trim().toLowerCase()).filter(Boolean));
  const seenPhones = new Set(existing.map((m) => normalizeGhanaPhone(m.primary_phone ?? undefined)).filter(Boolean));
  const seenEmails = new Set(existing.map((m) => m.primary_email?.trim().toLowerCase()).filter(Boolean));

  const outcome: ImportOutcome = { inserted: 0, skipped: 0, skippedDetail: [] };

  for (const row of rows) {
    const name = `${row.first_name} ${row.last_name}`.trim();
    const no = row.member_no?.trim().toLowerCase();
    const phone = normalizeGhanaPhone(row.primary_phone);
    const email = row.primary_email?.trim().toLowerCase();

    let reason: string | null = null;
    if (no && seenNos.has(no)) reason = `Member No "${row.member_no}" already exists`;
    else if (phone && seenPhones.has(phone)) reason = `Phone already on file`;
    else if (email && seenEmails.has(email)) reason = `Email already on file`;

    if (reason) {
      outcome.skipped++;
      outcome.skippedDetail.push({ name: name || "(unnamed)", reason });
      continue;
    }

    const member = await repo.insertMember({
      ...toRow(row),
      member_no: row.member_no ?? null,
      assembly_id: ctx.assemblyId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
    await repo.insertStatusHistory({
      assembly_id: ctx.assemblyId,
      member_id: member.id,
      status: row.current_status,
      reason: "Imported from spreadsheet",
      created_by: ctx.userId,
    });

    // Reserve identifiers so later rows in the same file can't duplicate them.
    if (no) seenNos.add(no);
    if (phone) seenPhones.add(phone);
    if (email) seenEmails.add(email);
    outcome.inserted++;
  }

  return ok(outcome);
}

export async function updateMember(
  ctx: AuthContext,
  memberId: string,
  values: MemberFormValues,
): Promise<Result<Member>> {
  requirePermission(ctx, "member.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const existing = await repo.findMemberById(ctx.assemblyId, memberId);
  if (!existing) return err(AppError.notFound("Member not found"));

  const member = await repo.updateMemberRow(ctx.assemblyId, memberId, {
    ...toRow(values),
    updated_by: ctx.userId,
  });

  // Only record history when the status actually changed.
  if (existing.current_status !== values.current_status) {
    await repo.insertStatusHistory({
      assembly_id: ctx.assemblyId,
      member_id: memberId,
      status: values.current_status,
      reason: `Changed from ${existing.current_status}`,
      created_by: ctx.userId,
    });
  }

  return ok(member);
}

export async function deleteMember(
  ctx: AuthContext,
  memberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "member.delete");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const existing = await repo.findMemberById(ctx.assemblyId, memberId);
  if (!existing) return err(AppError.notFound("Member not found"));

  await repo.softDeleteMember(ctx.assemblyId, memberId, ctx.userId);
  return ok(true);
}

export async function restoreMember(
  ctx: AuthContext,
  memberId: string,
): Promise<Result<true>> {
  requirePermission(ctx, "member.delete");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  await repo.restoreMember(ctx.assemblyId, memberId, ctx.userId);
  return ok(true);
}

export async function memberStatusCounts(
  ctx: AuthContext,
): Promise<Result<Record<string, number>>> {
  requirePermission(ctx, "member.read");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));
  return ok(await repo.countMembersByStatus(ctx.assemblyId));
}
