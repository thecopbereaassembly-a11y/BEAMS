import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/shared/types/database.types";

export type LeadershipPosition = Tables<"leadership_position">;

export interface AppointmentEntry {
  id: string;
  member_id: string;
  position_id: string;
  position_name: string;
  position_rank: number;
  portfolio: string | null;
  appointed_on: string | null;
  ordained_on: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  primary_phone: string | null;
}

/** Positions catalog: the assembly's own plus the shared CoP defaults. */
export async function listPositions(assemblyId: string): Promise<LeadershipPosition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leadership_position")
    .select("*")
    .or(`assembly_id.eq.${assemblyId},assembly_id.is.null`)
    .order("rank", { ascending: true });

  if (error) throw new Error(`Failed to load positions: ${error.message}`);
  return data ?? [];
}

export async function listAppointments(
  assemblyId: string,
  currentOnly = true,
): Promise<AppointmentEntry[]> {
  const supabase = await createClient();

  let builder = supabase
    .from("leadership_appointment")
    .select("id, member_id, position_id, portfolio, appointed_on, ordained_on, is_current")
    .eq("assembly_id", assemblyId)
    .is("deleted_at", null);

  if (currentOnly) builder = builder.eq("is_current", true);

  const { data: appointments, error } = await builder;
  if (error) throw new Error(`Failed to load appointments: ${error.message}`);
  if (!appointments?.length) return [];

  const [{ data: members }, { data: positions }] = await Promise.all([
    supabase
      .from("member")
      .select("id, first_name, last_name, preferred_name, primary_phone")
      .in("id", appointments.map((a) => a.member_id)),
    supabase
      .from("leadership_position")
      .select("id, name, rank")
      .in("id", appointments.map((a) => a.position_id)),
  ]);

  const memberById = new Map(members?.map((m) => [m.id, m]) ?? []);
  const positionById = new Map(positions?.map((p) => [p.id, p]) ?? []);

  return appointments
    .map((a) => {
      const member = memberById.get(a.member_id);
      const position = positionById.get(a.position_id);
      if (!member || !position) return null;
      return {
        id: a.id,
        member_id: a.member_id,
        position_id: a.position_id,
        position_name: position.name,
        position_rank: position.rank,
        portfolio: a.portfolio,
        appointed_on: a.appointed_on,
        ordained_on: a.ordained_on,
        first_name: member.first_name,
        last_name: member.last_name,
        preferred_name: member.preferred_name,
        primary_phone: member.primary_phone,
      } satisfies AppointmentEntry;
    })
    .filter((a): a is AppointmentEntry => a !== null)
    .sort(
      (a, b) =>
        a.position_rank - b.position_rank || a.last_name.localeCompare(b.last_name),
    );
}

export async function insertAppointment(
  values: TablesInsert<"leadership_appointment">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("leadership_appointment").insert(values);
  if (error) throw new Error(`Failed to record appointment: ${error.message}`);
}

/** Ends an appointment rather than deleting it — leadership history is kept. */
export async function endAppointment(
  assemblyId: string,
  appointmentId: string,
  actorId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leadership_appointment")
    .update({
      is_current: false,
      ended_on: new Date().toISOString().slice(0, 10),
      updated_by: actorId,
    })
    .eq("assembly_id", assemblyId)
    .eq("id", appointmentId);

  if (error) throw new Error(`Failed to end appointment: ${error.message}`);
}

/** Offices a member currently holds — shown on the member profile. */
export async function listAppointmentsForMember(
  assemblyId: string,
  memberId: string,
): Promise<{ position_name: string; portfolio: string | null }[]> {
  const supabase = await createClient();

  const { data: appointments } = await supabase
    .from("leadership_appointment")
    .select("position_id, portfolio")
    .eq("assembly_id", assemblyId)
    .eq("member_id", memberId)
    .eq("is_current", true)
    .is("deleted_at", null);

  if (!appointments?.length) return [];

  const { data: positions } = await supabase
    .from("leadership_position")
    .select("id, name")
    .in("id", appointments.map((a) => a.position_id));

  const byId = new Map(positions?.map((p) => [p.id, p.name]) ?? []);

  return appointments
    .map((a) => ({ position_name: byId.get(a.position_id) ?? "", portfolio: a.portfolio }))
    .filter((a) => a.position_name);
}
