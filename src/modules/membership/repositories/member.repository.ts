import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/shared/types/database.types";
import type { MemberListQuery } from "../schemas/member.schema";

export type Member = Tables<"member">;

/**
 * Data access for members. The ONLY place membership queries touch Supabase
 * (docs/03 §3). Tenant scoping and the soft-delete filter live here so no
 * caller can forget them — RLS is the guarantee, this is the seatbelt.
 */

const SOFT_DELETE_FILTER = "deleted_at" as const;

export interface ListResult {
  rows: Member[];
  total: number;
}

export async function listMembers(
  assemblyId: string,
  query: MemberListQuery,
): Promise<ListResult> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase
    .from("member")
    .select("*", { count: "exact" })
    .eq("assembly_id", assemblyId)
    .is(SOFT_DELETE_FILTER, null);

  if (query.q) {
    // Escape PostgREST's or() delimiters before interpolating user input.
    const term = query.q.replace(/[,()]/g, " ").trim();
    if (term) {
      builder = builder.or(
        [
          `first_name.ilike.%${term}%`,
          `last_name.ilike.%${term}%`,
          `preferred_name.ilike.%${term}%`,
          `primary_phone.ilike.%${term}%`,
          `primary_email.ilike.%${term}%`,
          `member_no.ilike.%${term}%`,
        ].join(","),
      );
    }
  }

  if (query.status) builder = builder.eq("current_status", query.status);
  if (query.home_cell_id) builder = builder.eq("home_cell_id", query.home_cell_id);

  const { data, error, count } = await builder
    .order(query.sort, { ascending: query.order === "asc" })
    .range(from, to);

  if (error) throw new Error(`Failed to list members: ${error.message}`);

  return { rows: data ?? [], total: count ?? 0 };
}

export async function findMemberById(
  assemblyId: string,
  memberId: string,
): Promise<Member | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", memberId)
    .is(SOFT_DELETE_FILTER, null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load member: ${error.message}`);
  return data;
}

export async function insertMember(
  values: TablesInsert<"member">,
): Promise<Member> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .insert(values)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create member: ${error.message}`);
  return data;
}

export async function updateMemberRow(
  assemblyId: string,
  memberId: string,
  values: TablesUpdate<"member">,
): Promise<Member> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .update(values)
    .eq("assembly_id", assemblyId)
    .eq("id", memberId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update member: ${error.message}`);
  return data;
}

/** Soft delete — sets deleted_at, never removes the row (docs/05 §1). */
export async function softDeleteMember(
  assemblyId: string,
  memberId: string,
  actorId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("member")
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq("assembly_id", assemblyId)
    .eq("id", memberId);

  if (error) throw new Error(`Failed to delete member: ${error.message}`);
}

export async function restoreMember(
  assemblyId: string,
  memberId: string,
  actorId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("member")
    .update({ deleted_at: null, updated_by: actorId })
    .eq("assembly_id", assemblyId)
    .eq("id", memberId);

  if (error) throw new Error(`Failed to restore member: ${error.message}`);
}

/** Dashboard/list summary counts by status. */
export async function countMembersByStatus(
  assemblyId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .select("current_status")
    .eq("assembly_id", assemblyId)
    .is(SOFT_DELETE_FILTER, null);

  if (error) throw new Error(`Failed to count members: ${error.message}`);

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.current_status] = (acc[row.current_status] ?? 0) + 1;
    return acc;
  }, {});
}

/** Existing identifiers in an assembly — used to skip duplicates on import. */
export async function listMemberIdentifiers(
  assemblyId: string,
): Promise<{ member_no: string | null; primary_phone: string | null; primary_email: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .select("member_no, primary_phone, primary_email")
    .eq("assembly_id", assemblyId)
    .is(SOFT_DELETE_FILTER, null);

  if (error) throw new Error(`Failed to read existing members: ${error.message}`);
  return data ?? [];
}

/** Recorded when status changes — history is the source of truth (ADR-007). */
export async function insertStatusHistory(
  values: TablesInsert<"membership_status_history">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("membership_status_history").insert(values);
  if (error) throw new Error(`Failed to record status history: ${error.message}`);
}
