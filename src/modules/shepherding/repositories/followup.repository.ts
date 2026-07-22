import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/shared/types/database.types";
import type { FollowupListQuery } from "../schemas/followup.schema";

export type Followup = Tables<"followup">;
export type FollowupActivity = Tables<"followup_activity">;

export interface FollowupEntry extends Followup {
  subjectName: string;
  assigneeName: string | null;
  activityCount: number;
}

export async function listFollowups(
  assemblyId: string,
  query: FollowupListQuery,
  currentMemberId: string | null,
): Promise<FollowupEntry[]> {
  const supabase = await createClient();

  let builder = supabase
    .from("followup")
    .select("*")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null);

  if (query.status !== "all") builder = builder.eq("status", query.status);
  if (query.priority) builder = builder.eq("priority", query.priority);

  const { data: followups, error } = await builder.order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load follow-ups: ${error.message}`);
  if (!followups?.length) return [];

  const memberIds = followups.map((f) => f.subject_member_id).filter(Boolean) as string[];
  const visitorIds = followups.map((f) => f.subject_visitor_id).filter(Boolean) as string[];

  const [{ data: members }, { data: visitors }, { data: assignments }, { data: activities }] =
    await Promise.all([
      memberIds.length
        ? supabase.from("member").select("id, first_name, last_name, preferred_name").in("id", memberIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; preferred_name: string | null }[] }),
      visitorIds.length
        ? supabase.from("visitor").select("id, first_name, last_name").in("id", visitorIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string | null }[] }),
      supabase
        .from("shepherd_assignment")
        .select("followup_id, shepherd_member_id")
        .eq("assembly_id", assemblyId)
        .eq("is_active", true)
        .in("followup_id", followups.map((f) => f.id)),
      supabase
        .from("followup_activity")
        .select("followup_id")
        .eq("assembly_id", assemblyId)
        .in("followup_id", followups.map((f) => f.id)),
    ]);

  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  const visitorById = new Map((visitors ?? []).map((v) => [v.id, v]));

  const shepherdIds = (assignments ?? [])
    .map((a) => a.shepherd_member_id)
    .filter(Boolean) as string[];
  const { data: shepherds } = shepherdIds.length
    ? await supabase.from("member").select("id, first_name, last_name").in("id", shepherdIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const shepherdById = new Map((shepherds ?? []).map((s) => [s.id, s]));

  const assignedTo = new Map(
    (assignments ?? []).map((a) => [a.followup_id, a.shepherd_member_id]),
  );
  const activityCounts = (activities ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.followup_id] = (acc[a.followup_id] ?? 0) + 1;
    return acc;
  }, {});

  let rows = followups.map((f) => {
    const member = f.subject_member_id ? memberById.get(f.subject_member_id) : null;
    const visitor = f.subject_visitor_id ? visitorById.get(f.subject_visitor_id) : null;
    const shepherdId = assignedTo.get(f.id) ?? null;
    const shepherd = shepherdId ? shepherdById.get(shepherdId) : null;

    return {
      ...f,
      subjectName: member
        ? `${member.preferred_name?.trim() || member.first_name} ${member.last_name}`
        : visitor
          ? [visitor.first_name, visitor.last_name].filter(Boolean).join(" ")
          : "Unknown",
      assigneeName: shepherd ? `${shepherd.first_name} ${shepherd.last_name}` : null,
      activityCount: activityCounts[f.id] ?? 0,
      _shepherdId: shepherdId,
    };
  });

  if (query.mine === "mine" && currentMemberId) {
    rows = rows.filter((r) => r._shepherdId === currentMemberId);
  }

  return rows.map(({ _shepherdId: _omit, ...rest }) => rest);
}

export async function findFollowupById(
  assemblyId: string,
  followupId: string,
): Promise<Followup | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", followupId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load follow-up: ${error.message}`);
  return data;
}

export async function insertFollowup(values: TablesInsert<"followup">): Promise<Followup> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("followup").insert(values).select("*").single();
  if (error) throw new Error(`Failed to create follow-up: ${error.message}`);
  return data;
}

export async function updateFollowupRow(
  assemblyId: string,
  followupId: string,
  values: TablesUpdate<"followup">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("followup")
    .update(values)
    .eq("assembly_id", assemblyId)
    .eq("id", followupId);
  if (error) throw new Error(`Failed to update follow-up: ${error.message}`);
}

export async function assignShepherd(
  values: TablesInsert<"shepherd_assignment">,
): Promise<void> {
  const supabase = await createClient();
  // Deactivate any previous assignment so there is one active shepherd.
  await supabase
    .from("shepherd_assignment")
    .update({ is_active: false })
    .eq("assembly_id", values.assembly_id)
    .eq("followup_id", values.followup_id);

  const { error } = await supabase.from("shepherd_assignment").insert(values);
  if (error) throw new Error(`Failed to assign shepherd: ${error.message}`);
}

export async function insertActivity(
  values: TablesInsert<"followup_activity">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("followup_activity").insert(values);
  if (error) throw new Error(`Failed to log activity: ${error.message}`);
}

export async function listActivities(
  assemblyId: string,
  followupId: string,
): Promise<FollowupActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followup_activity")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("followup_id", followupId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`Failed to load activities: ${error.message}`);
  return data ?? [];
}

/** Member ids that already have an OPEN follow-up for this reason. */
export async function membersWithOpenFollowup(
  assemblyId: string,
  reason: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("followup")
    .select("subject_member_id")
    .eq("assembly_id", assemblyId)
    .eq("reason", reason)
    .in("status", ["open", "in_progress"])
    .is("deleted_at", null);

  return new Set((data ?? []).map((f) => f.subject_member_id).filter(Boolean) as string[]);
}

export async function insertManyFollowups(
  values: TablesInsert<"followup">[],
): Promise<number> {
  if (values.length === 0) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.from("followup").insert(values).select("id");
  if (error) throw new Error(`Failed to create follow-ups: ${error.message}`);
  return data?.length ?? 0;
}
