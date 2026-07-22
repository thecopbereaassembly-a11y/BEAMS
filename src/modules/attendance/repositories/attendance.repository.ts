import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/shared/types/database.types";
import type { AttendanceMark } from "../schemas/attendance.schema";

export type ServiceType = Tables<"service_type">;
export type AttendanceSession = Tables<"attendance_session">;
export type AttendanceRecord = Tables<"attendance_record">;
export type AttendanceCount = Tables<"attendance_count">;

export async function listServiceTypes(assemblyId: string): Promise<ServiceType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_type")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`Failed to load service types: ${error.message}`);
  return data ?? [];
}

export async function listSessions(
  assemblyId: string,
  limit = 30,
): Promise<(AttendanceSession & { present: number; serviceName: string })[]> {
  const supabase = await createClient();

  const { data: sessions, error } = await supabase
    .from("attendance_session")
    .select("*")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .order("service_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load sessions: ${error.message}`);
  if (!sessions?.length) return [];

  const [{ data: types }, { data: records }] = await Promise.all([
    supabase
      .from("service_type")
      .select("id, name")
      .in("id", [...new Set(sessions.map((s) => s.service_type_id))]),
    supabase
      .from("attendance_record")
      .select("session_id, status")
      .in("session_id", sessions.map((s) => s.id)),
  ]);

  const typeName = new Map(types?.map((t) => [t.id, t.name]) ?? []);
  const presentBySession = (records ?? []).reduce<Record<string, number>>((acc, r) => {
    if (r.status === "present" || r.status === "late") {
      acc[r.session_id] = (acc[r.session_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  return sessions.map((s) => ({
    ...s,
    present: presentBySession[s.id] ?? 0,
    serviceName: typeName.get(s.service_type_id) ?? "Service",
  }));
}

export async function findSessionById(
  assemblyId: string,
  sessionId: string,
): Promise<AttendanceSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_session")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("id", sessionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Failed to load session: ${error.message}`);
  return data;
}

export async function insertSession(
  values: TablesInsert<"attendance_session">,
): Promise<AttendanceSession> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_session")
    .insert(values)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return data;
}

/**
 * Idempotent bulk upsert of attendance marks.
 *
 * The unique constraint on (session_id, member_id) plus `onConflict` means a
 * queued mark replayed after reconnect UPDATES rather than duplicating — the
 * property that makes offline capture safe (docs/07 §4).
 */
export async function upsertMarks(
  assemblyId: string,
  marks: AttendanceMark[],
  actorId: string,
): Promise<number> {
  if (marks.length === 0) return 0;
  const supabase = await createClient();

  const rows: TablesInsert<"attendance_record">[] = marks.map((m) => ({
    assembly_id: assemblyId,
    session_id: m.session_id,
    member_id: m.member_id,
    status: m.status,
    client_uuid: m.client_uuid,
    captured_offline: m.captured_offline,
    created_by: actorId,
  }));

  const { data, error } = await supabase
    .from("attendance_record")
    .upsert(rows, { onConflict: "session_id,member_id" })
    .select("id");

  if (error) throw new Error(`Failed to save attendance: ${error.message}`);
  return data?.length ?? 0;
}

export async function listSessionMarks(
  assemblyId: string,
  sessionId: string,
): Promise<AttendanceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_record")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("session_id", sessionId);
  if (error) throw new Error(`Failed to load attendance: ${error.message}`);
  return data ?? [];
}

export async function upsertHeadcount(
  values: TablesInsert<"attendance_count">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_count")
    .upsert(values, { onConflict: "session_id,category" });
  if (error) throw new Error(`Failed to save headcount: ${error.message}`);
}

export async function listHeadcounts(
  assemblyId: string,
  sessionId: string,
): Promise<AttendanceCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_count")
    .select("*")
    .eq("assembly_id", assemblyId)
    .eq("session_id", sessionId);
  if (error) throw new Error(`Failed to load headcounts: ${error.message}`);
  return data ?? [];
}

/** Roster for capture: every active member, ordered for quick scanning. */
export async function listRosterForCapture(assemblyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member")
    .select("id, first_name, last_name, preferred_name, home_cell_id")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .in("current_status", ["member", "new_convert"])
    .order("last_name")
    .limit(2000);
  if (error) throw new Error(`Failed to load roster: ${error.message}`);
  return data ?? [];
}

/** A member's attendance history — shown on their profile. */
export async function listMemberAttendance(
  assemblyId: string,
  memberId: string,
  limit = 20,
): Promise<{ date: string; status: string; serviceName: string }[]> {
  const supabase = await createClient();

  const { data: records } = await supabase
    .from("attendance_record")
    .select("session_id, status")
    .eq("assembly_id", assemblyId)
    .eq("member_id", memberId)
    .limit(limit * 2);

  if (!records?.length) return [];

  const { data: sessions } = await supabase
    .from("attendance_session")
    .select("id, service_date, service_type_id")
    .in("id", [...new Set(records.map((r) => r.session_id))])
    .order("service_date", { ascending: false });

  if (!sessions?.length) return [];

  const { data: types } = await supabase
    .from("service_type")
    .select("id, name")
    .in("id", [...new Set(sessions.map((s) => s.service_type_id))]);

  const typeName = new Map(types?.map((t) => [t.id, t.name]) ?? []);
  const statusBySession = new Map(records.map((r) => [r.session_id, r.status]));

  return sessions
    .map((s) => ({
      date: s.service_date,
      status: statusBySession.get(s.id) ?? "absent",
      serviceName: typeName.get(s.service_type_id) ?? "Service",
    }))
    .slice(0, limit);
}

/**
 * Members with no 'present'/'late' record across the most recent N sessions —
 * the absentee signal that feeds Shepherding follow-ups in M5.
 */
export async function findAbsentees(
  assemblyId: string,
  sessionCount = 4,
): Promise<string[]> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("attendance_session")
    .select("id")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null)
    .order("service_date", { ascending: false })
    .limit(sessionCount);

  if (!sessions?.length) return [];
  const sessionIds = sessions.map((s) => s.id);

  const [{ data: members }, { data: present }] = await Promise.all([
    supabase
      .from("member")
      .select("id")
      .eq("assembly_id", assemblyId)
      .is("deleted_at", null)
      .eq("current_status", "member"),
    supabase
      .from("attendance_record")
      .select("member_id, status")
      .in("session_id", sessionIds),
  ]);

  const attended = new Set(
    (present ?? [])
      .filter((r) => (r.status === "present" || r.status === "late") && r.member_id)
      .map((r) => r.member_id as string),
  );

  return (members ?? []).map((m) => m.id).filter((id) => !attended.has(id));
}
