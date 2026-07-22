import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/shared/types/database.types";
import type { HomeCellListQuery } from "../schemas/home-cell.schema";

export type HomeCell = Tables<"home_cell">;
export type HomeCellMember = Tables<"home_cell_member">;
export type HomeCellReport = Tables<"home_cell_report">;
type Member = Tables<"member">;

/** Roster row joined with the member's display fields. */
export interface RosterEntry {
  id: string;
  member_id: string;
  role: string;
  joined_on: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  primary_phone: string | null;
}

export async function listHomeCells(
  assemblyId: string,
  query: HomeCellListQuery,
): Promise<{ rows: HomeCell[]; total: number }> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;

  let builder = supabase
    .from("home_cell")
    .select("*", { count: "exact" })
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null);

  if (query.q) {
    const term = query.q.replace(/[,()]/g, " ").trim();
    if (term) {
      builder = builder.or(
        [`name.ilike.%${term}%`, `code.ilike.%${term}%`, `location.ilike.%${term}%`].join(","),
      );
    }
  }
  if (query.active === "active") builder = builder.eq("is_active", true);
  if (query.active === "inactive") builder = builder.eq("is_active", false);

  const { data, error, count } = await builder
    .order("name", { ascending: true })
    .range(from, from + query.pageSize - 1);

  if (error) throw new Error(`Failed to list home cells: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function findHomeCellById(
  assemblyId: string,
  cellId: string,
): Promise<HomeCell | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_cell")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", cellId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to load home cell: ${error.message}`);
  return data;
}

export async function insertHomeCell(values: TablesInsert<"home_cell">): Promise<HomeCell> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("home_cell").insert(values).select("*").single();
  if (error) throw new Error(`Failed to create home cell: ${error.message}`);
  return data;
}

export async function updateHomeCellRow(
  assemblyId: string,
  cellId: string,
  values: TablesUpdate<"home_cell">,
): Promise<HomeCell> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_cell")
    .update(values)
    .eq("assembly_id", assemblyId)
    .eq("id", cellId)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to update home cell: ${error.message}`);
  return data;
}

export async function softDeleteHomeCell(
  assemblyId: string,
  cellId: string,
  actorId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("home_cell")
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq("assembly_id", assemblyId)
    .eq("id", cellId);
  if (error) throw new Error(`Failed to delete home cell: ${error.message}`);
}

// ── Roster ──────────────────────────────────────────────────────────────────

/**
 * Roster with member details. Fetched as two queries rather than a PostgREST
 * embed: our generated types carry no relationship metadata, so an embed would
 * not type-check.
 */
export async function listCellRoster(
  assemblyId: string,
  cellId: string,
): Promise<RosterEntry[]> {
  const supabase = await createClient();

  const { data: links, error } = await supabase
    .from("home_cell_member")
    .select("id, member_id, role, joined_on")
    .eq("assembly_id", assemblyId)
    .eq("home_cell_id", cellId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load roster: ${error.message}`);
  if (!links || links.length === 0) return [];

  const { data: members, error: memberErr } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name, primary_phone")
    .in("id", links.map((l) => l.member_id))
    .is("deleted_at", null);

  if (memberErr) throw new Error(`Failed to load roster members: ${memberErr.message}`);

  const byId = new Map(members?.map((m) => [m.id, m]) ?? []);

  return links
    .map((link) => {
      const member = byId.get(link.member_id);
      if (!member) return null;
      return {
        id: link.id,
        member_id: link.member_id,
        role: link.role,
        joined_on: link.joined_on,
        first_name: member.first_name,
        last_name: member.last_name,
        preferred_name: member.preferred_name,
        primary_phone: member.primary_phone,
      } satisfies RosterEntry;
    })
    .filter((r): r is RosterEntry => r !== null)
    .sort((a, b) => {
      const rank = (r: string) => (r === "leader" ? 0 : r === "assistant" ? 1 : 2);
      return rank(a.role) - rank(b.role) || a.last_name.localeCompare(b.last_name);
    });
}

export async function addMemberToCell(
  values: TablesInsert<"home_cell_member">,
): Promise<void> {
  const supabase = await createClient();
  // Re-activate a prior membership rather than creating a duplicate.
  const { error } = await supabase
    .from("home_cell_member")
    .upsert(values, { onConflict: "home_cell_id,member_id" });
  if (error) throw new Error(`Failed to add member to cell: ${error.message}`);
}

export async function removeMemberFromCell(
  assemblyId: string,
  cellId: string,
  memberId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("home_cell_member")
    .update({ is_active: false, left_on: new Date().toISOString().slice(0, 10) })
    .eq("assembly_id", assemblyId)
    .eq("home_cell_id", cellId)
    .eq("member_id", memberId);
  if (error) throw new Error(`Failed to remove member: ${error.message}`);
}

/** Keeps member.home_cell_id (the cached convenience column) in step. */
export async function setMemberHomeCell(
  assemblyId: string,
  memberId: string,
  cellId: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("member")
    .update({ home_cell_id: cellId })
    .eq("assembly_id", assemblyId)
    .eq("id", memberId);
  if (error) throw new Error(`Failed to update member's cell: ${error.message}`);
}

/** Members not yet on this cell's roster — for the "add member" picker. */
export async function listAssignableMembers(
  assemblyId: string,
  cellId: string,
): Promise<Pick<Member, "id" | "first_name" | "last_name" | "preferred_name">[]> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("home_cell_member")
    .select("member_id")
    .eq("assembly_id", assemblyId)
    .eq("home_cell_id", cellId)
    .eq("is_active", true);

  const excluded = new Set((existing ?? []).map((e) => e.member_id));

  const { data, error } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .limit(500);

  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return (data ?? []).filter((m) => !excluded.has(m.id));
}

// ── Weekly reports ──────────────────────────────────────────────────────────

export async function listCellReports(
  assemblyId: string,
  cellId: string,
  limit = 12,
): Promise<HomeCellReport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_cell_report")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("home_cell_id", cellId)
    .is("deleted_at", null)
    .order("report_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load reports: ${error.message}`);
  return data ?? [];
}

export async function insertCellReport(
  values: TablesInsert<"home_cell_report">,
): Promise<HomeCellReport> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_cell_report")
    .insert(values)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save report: ${error.message}`);
  return data;
}

/** Roster size per cell, for the list view. */
export async function countMembersPerCell(
  assemblyId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("home_cell_member")
    .select("home_cell_id")
    .eq("assembly_id", assemblyId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to count cell members: ${error.message}`);

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.home_cell_id] = (acc[row.home_cell_id] ?? 0) + 1;
    return acc;
  }, {});
}
