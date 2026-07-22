import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";

/**
 * Audience segments (docs/04 §16). Each resolves to a recipient list at send
 * time, so "Absentees" always means absentees *today*, not whenever the segment
 * was created.
 */

export interface Recipient {
  member_id: string;
  name: string;
  first_name: string;
  phone: string | null;
  email: string | null;
}

export interface SegmentDefinition {
  key: string;
  name: string;
  description: string;
}

export const SEGMENTS: SegmentDefinition[] = [
  { key: "all_members", name: "All members", description: "Every active member." },
  { key: "absentees", name: "Absentees", description: "No attendance in the last 4 services." },
  { key: "birthdays_this_month", name: "Birthdays this month", description: "Members celebrating this month." },
  { key: "new_converts", name: "New converts", description: "Members with new-convert status." },
  { key: "home_cell_leaders", name: "Home cell leaders", description: "Everyone leading a cell." },
  { key: "visitors_not_joined", name: "Visitors not yet joined", description: "Visitors who have not become members." },
];

export function findSegment(key: string): SegmentDefinition | undefined {
  return SEGMENTS.find((s) => s.key === key);
}

export async function resolveSegment(
  ctx: AuthContext,
  key: string,
): Promise<Recipient[]> {
  const assemblyId = ctx.assemblyId;
  if (!assemblyId) return [];

  const supabase = await createClient();

  const toRecipients = (
    rows: {
      id: string;
      first_name: string;
      last_name: string;
      preferred_name: string | null;
      primary_phone: string | null;
      primary_email: string | null;
    }[],
  ): Recipient[] =>
    rows.map((m) => ({
      member_id: m.id,
      first_name: m.preferred_name?.trim() || m.first_name,
      name: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
      phone: m.primary_phone,
      email: m.primary_email,
    }));

  const baseSelect = "id, first_name, last_name, preferred_name, primary_phone, primary_email";

  switch (key) {
    case "all_members": {
      const { data } = await supabase
        .from("member")
        .select(baseSelect)
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .in("current_status", ["member", "new_convert"]);
      return toRecipients(data ?? []);
    }

    case "new_converts": {
      const { data } = await supabase
        .from("member")
        .select(baseSelect)
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .eq("current_status", "new_convert");
      return toRecipients(data ?? []);
    }

    case "birthdays_this_month": {
      // NOTE: the select string must be a literal — concatenating it defeats
      // supabase-js type inference and yields GenericStringError.
      const { data } = await supabase
        .from("member")
        .select(
          "id, first_name, last_name, preferred_name, primary_phone, primary_email, date_of_birth",
        )
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .not("date_of_birth", "is", null);
      const month = new Date().getMonth();
      return toRecipients(
        (data ?? []).filter(
          (m) => m.date_of_birth !== null && new Date(m.date_of_birth).getMonth() === month,
        ),
      );
    }

    case "home_cell_leaders": {
      const { data: links } = await supabase
        .from("home_cell_member")
        .select("member_id")
        .eq("assembly_id", assemblyId)
        .eq("is_active", true)
        .in("role", ["leader", "assistant"]);
      const ids = [...new Set((links ?? []).map((l) => l.member_id))];
      if (ids.length === 0) return [];
      const { data } = await supabase.from("member").select(baseSelect).in("id", ids);
      return toRecipients(data ?? []);
    }

    case "absentees": {
      const { data: sessions } = await supabase
        .from("attendance_session")
        .select("id")
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .order("service_date", { ascending: false })
        .limit(4);

      if (!sessions?.length) return [];

      const { data: present } = await supabase
        .from("attendance_record")
        .select("member_id, status")
        .in("session_id", sessions.map((s) => s.id));

      const attended = new Set(
        (present ?? [])
          .filter((r) => (r.status === "present" || r.status === "late") && r.member_id)
          .map((r) => r.member_id as string),
      );

      const { data } = await supabase
        .from("member")
        .select(baseSelect)
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .eq("current_status", "member");

      return toRecipients((data ?? []).filter((m) => !attended.has(m.id)));
    }

    case "visitors_not_joined": {
      const { data } = await supabase
        .from("visitor")
        .select("id, first_name, last_name, phone, email")
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .eq("is_converted", false);

      return (data ?? []).map((v) => ({
        member_id: v.id, // visitor id — this segment addresses visitors
        first_name: v.first_name,
        name: [v.first_name, v.last_name].filter(Boolean).join(" "),
        phone: v.phone,
        email: v.email,
      }));
    }

    default:
      return [];
  }
}

/**
 * Removes anyone who has opted out of this channel (Ghana Data Protection Act,
 * docs/08 §8). Consent is checked at SEND time, never cached into a segment.
 */
export async function applyConsent(
  ctx: AuthContext,
  recipients: Recipient[],
  channel: "sms" | "email",
): Promise<{ allowed: Recipient[]; optedOut: number }> {
  if (!ctx.assemblyId || recipients.length === 0) {
    return { allowed: recipients, optedOut: 0 };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("communication_consent")
    .select("member_id, status")
    .eq("assembly_id", ctx.assemblyId)
    .eq("channel", channel)
    .eq("status", "opted_out");

  const blocked = new Set((data ?? []).map((c) => c.member_id));
  const allowed = recipients.filter((r) => !blocked.has(r.member_id));

  return { allowed, optedOut: recipients.length - allowed.length };
}
