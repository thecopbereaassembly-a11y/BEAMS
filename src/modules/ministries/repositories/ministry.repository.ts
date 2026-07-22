import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/shared/types/database.types";
import type { MinistryListQuery } from "../schemas/ministry.schema";

export type Ministry = Tables<"ministry">;

export interface MinistryRosterEntry {
  id: string;
  member_id: string;
  joined_on: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  primary_phone: string | null;
}

export async function listMinistries(
  assemblyId: string,
  query: MinistryListQuery,
): Promise<{ rows: Ministry[]; total: number }> {
  const supabase = await createClient();
  const from = (query.page - 1) * query.pageSize;

  let builder = supabase
    .from("ministry")
    .select("*", { count: "exact" })
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null);

  if (query.q) {
    const term = query.q.replace(/[,()]/g, " ").trim();
    if (term) builder = builder.or([`name.ilike.%${term}%`, `code.ilike.%${term}%`].join(","));
  }
  if (query.category) builder = builder.eq("category", query.category);

  const { data, error, count } = await builder
    .order("name", { ascending: true })
    .range(from, from + query.pageSize - 1);

  if (error) throw new Error(`Failed to list ministries: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function findMinistryById(
  assemblyId: string,
  ministryId: string,
): Promise<Ministry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ministry")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", ministryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load ministry: ${error.message}`);
  return data;
}

export async function insertMinistry(values: TablesInsert<"ministry">): Promise<Ministry> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ministry").insert(values).select("*").single();
  if (error) throw new Error(`Failed to create ministry: ${error.message}`);
  return data;
}

export async function updateMinistryRow(
  assemblyId: string,
  ministryId: string,
  values: TablesUpdate<"ministry">,
): Promise<Ministry> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ministry")
    .update(values)
    .eq("assembly_id", assemblyId)
    .eq("id", ministryId)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to update ministry: ${error.message}`);
  return data;
}

export async function softDeleteMinistry(
  assemblyId: string,
  ministryId: string,
  actorId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ministry")
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq("assembly_id", assemblyId)
    .eq("id", ministryId);
  if (error) throw new Error(`Failed to delete ministry: ${error.message}`);
}

export async function listMinistryRoster(
  assemblyId: string,
  ministryId: string,
): Promise<MinistryRosterEntry[]> {
  const supabase = await createClient();

  const { data: links, error } = await supabase
    .from("ministry_member")
    .select("id, member_id, joined_on")
    .eq("assembly_id", assemblyId)
    .eq("ministry_id", ministryId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load ministry roster: ${error.message}`);
  if (!links?.length) return [];

  const { data: members, error: memberErr } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name, primary_phone")
    .in("id", links.map((l) => l.member_id))
    .is("deleted_at", null);

  if (memberErr) throw new Error(`Failed to load members: ${memberErr.message}`);
  const byId = new Map(members?.map((m) => [m.id, m]) ?? []);

  return links
    .map((link) => {
      const m = byId.get(link.member_id);
      return m
        ? ({
            id: link.id,
            member_id: link.member_id,
            joined_on: link.joined_on,
            first_name: m.first_name,
            last_name: m.last_name,
            preferred_name: m.preferred_name,
            primary_phone: m.primary_phone,
          } satisfies MinistryRosterEntry)
        : null;
    })
    .filter((r): r is MinistryRosterEntry => r !== null)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));
}

export async function addMemberToMinistry(
  values: TablesInsert<"ministry_member">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ministry_member")
    .upsert(values, { onConflict: "ministry_id,member_id" });
  if (error) throw new Error(`Failed to add member: ${error.message}`);
}

export async function removeMemberFromMinistry(
  assemblyId: string,
  ministryId: string,
  memberId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ministry_member")
    .update({ is_active: false, left_on: new Date().toISOString().slice(0, 10) })
    .eq("assembly_id", assemblyId)
    .eq("ministry_id", ministryId)
    .eq("member_id", memberId);
  if (error) throw new Error(`Failed to remove member: ${error.message}`);
}

export async function listAssignableMembers(assemblyId: string, ministryId: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("ministry_member")
    .select("member_id")
    .eq("assembly_id", assemblyId)
    .eq("ministry_id", ministryId)
    .eq("is_active", true);

  const excluded = new Set((existing ?? []).map((e) => e.member_id));

  const { data, error } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .order("last_name")
    .limit(500);

  if (error) throw new Error(`Failed to load members: ${error.message}`);
  return (data ?? []).filter((m) => !excluded.has(m.id));
}

export async function countMembersPerMinistry(
  assemblyId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ministry_member")
    .select("ministry_id")
    .eq("assembly_id", assemblyId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to count ministry members: ${error.message}`);

  return (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.ministry_id] = (acc[row.ministry_id] ?? 0) + 1;
    return acc;
  }, {});
}

/** Ministries a given member belongs to — used on the member profile. */
export async function listMinistriesForMember(
  assemblyId: string,
  memberId: string,
): Promise<Ministry[]> {
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("ministry_member")
    .select("ministry_id")
    .eq("assembly_id", assemblyId)
    .eq("member_id", memberId)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (!links?.length) return [];

  const { data, error } = await supabase
    .from("ministry")
    .select("*")
    .in("id", links.map((l) => l.ministry_id))
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load member ministries: ${error.message}`);
  return data ?? [];
}
