import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { can } from "@/shared/rbac/can";

/**
 * Dashboard aggregation (docs/04 §1, docs/11 §1).
 *
 * Every section is permission-gated and degrades gracefully: a Home Cell Leader
 * without finance permissions simply gets no finance data, and modules not yet
 * built return empty rather than failing the page.
 */

export interface AttendancePoint {
  date: string;
  label: string;
  present: number;
}

export interface GrowthPoint {
  month: string;
  label: string;
  total: number;
}

export interface BirthdayEntry {
  id: string;
  name: string;
  day: number;
  month: number;
  isToday: boolean;
}

export interface DashboardData {
  memberTotal: number;
  newThisMonth: number;
  cellTotal: number;
  ministryTotal: number;
  avgAttendance: number;
  lastAttendance: number | null;
  attendanceTrend: AttendancePoint[];
  growth: GrowthPoint[];
  birthdaysThisMonth: BirthdayEntry[];
  anniversariesThisMonth: BirthdayEntry[];
  unassignedMembers: number;
  cellsWithoutRecentReport: number;
}

const monthLabel = (m: number) =>
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] ??
  "";

/** dd/mm for compact chart axes. */
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export async function getDashboardData(
  ctx: AuthContext,
  now = new Date(),
): Promise<DashboardData> {
  const supabase = await createClient();
  const assemblyId = ctx.assemblyId ?? "";

  const empty: DashboardData = {
    memberTotal: 0,
    newThisMonth: 0,
    cellTotal: 0,
    ministryTotal: 0,
    avgAttendance: 0,
    lastAttendance: null,
    attendanceTrend: [],
    growth: [],
    birthdaysThisMonth: [],
    anniversariesThisMonth: [],
    unassignedMembers: 0,
    cellsWithoutRecentReport: 0,
  };

  if (!assemblyId) return empty;

  // ── Members (the base of most widgets) ────────────────────────────────────
  let members: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    date_of_birth: string | null;
    wedding_anniversary: string | null;
    created_at: string;
    home_cell_id: string | null;
  }[] = [];

  if (can(ctx, "member.read")) {
    const { data } = await supabase
      .from("member")
      .select(
        "id, first_name, last_name, preferred_name, date_of_birth, wedding_anniversary, created_at, home_cell_id",
      )
      .eq("assembly_id", assemblyId)
      .is("deleted_at", null)
      .in("current_status", ["member", "new_convert"]);
    members = data ?? [];
  }

  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const today = now.getDate();

  const birthdaysThisMonth: BirthdayEntry[] = members
    .filter((m) => m.date_of_birth && new Date(m.date_of_birth).getMonth() === thisMonth)
    .map((m) => {
      const d = new Date(m.date_of_birth as string);
      return {
        id: m.id,
        name: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
        day: d.getDate(),
        month: d.getMonth(),
        isToday: d.getDate() === today,
      };
    })
    .sort((a, b) => a.day - b.day);

  const anniversariesThisMonth: BirthdayEntry[] = members
    .filter(
      (m) => m.wedding_anniversary && new Date(m.wedding_anniversary).getMonth() === thisMonth,
    )
    .map((m) => {
      const d = new Date(m.wedding_anniversary as string);
      return {
        id: m.id,
        name: `${m.preferred_name?.trim() || m.first_name} ${m.last_name}`,
        day: d.getDate(),
        month: d.getMonth(),
        isToday: d.getDate() === today,
      };
    })
    .sort((a, b) => a.day - b.day);

  const newThisMonth = members.filter((m) => {
    const created = new Date(m.created_at);
    return created.getMonth() === thisMonth && created.getFullYear() === thisYear;
  }).length;

  // Membership growth: cumulative total at the end of each of the last 6 months.
  const growth: GrowthPoint[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const cutoff = new Date(thisYear, thisMonth - i + 1, 1);
    const total = members.filter((m) => new Date(m.created_at) < cutoff).length;
    const monthIndex = (thisMonth - i + 12) % 12;
    growth.push({
      month: `${cutoff.getFullYear()}-${monthIndex + 1}`,
      label: monthLabel(monthIndex),
      total,
    });
  }

  // ── Attendance trend (last 8 sessions) ────────────────────────────────────
  let attendanceTrend: AttendancePoint[] = [];
  if (can(ctx, "attendance.read")) {
    const { data: sessions } = await supabase
      .from("attendance_session")
      .select("id, service_date")
      .eq("assembly_id", assemblyId)
      .is("deleted_at", null)
      .order("service_date", { ascending: false })
      .limit(8);

    if (sessions?.length) {
      const { data: records } = await supabase
        .from("attendance_record")
        .select("session_id, status")
        .in("session_id", sessions.map((s) => s.id));

      const presentBy = (records ?? []).reduce<Record<string, number>>((acc, r) => {
        if (r.status === "present" || r.status === "late") {
          acc[r.session_id] = (acc[r.session_id] ?? 0) + 1;
        }
        return acc;
      }, {});

      attendanceTrend = sessions
        .slice()
        .reverse()
        .map((s) => ({
          date: s.service_date,
          label: shortDate(s.service_date),
          present: presentBy[s.id] ?? 0,
        }));
    }
  }

  const avgAttendance =
    attendanceTrend.length > 0
      ? Math.round(
          attendanceTrend.reduce((sum, p) => sum + p.present, 0) / attendanceTrend.length,
        )
      : 0;

  // ── Groups ────────────────────────────────────────────────────────────────
  let cellTotal = 0;
  let cellsWithoutRecentReport = 0;
  if (can(ctx, "homecell.read")) {
    const { data: cells } = await supabase
      .from("home_cell")
      .select("id")
      .eq("assembly_id", assemblyId)
      .eq("is_active", true)
      .is("deleted_at", null);
    cellTotal = cells?.length ?? 0;

    if (cells?.length) {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { data: recent } = await supabase
        .from("home_cell_report")
        .select("home_cell_id")
        .eq("assembly_id", assemblyId)
        .gte("report_date", fourteenDaysAgo);

      const reported = new Set((recent ?? []).map((r) => r.home_cell_id));
      cellsWithoutRecentReport = cells.filter((c) => !reported.has(c.id)).length;
    }
  }

  let ministryTotal = 0;
  if (can(ctx, "ministry.read")) {
    const { count } = await supabase
      .from("ministry")
      .select("*", { count: "exact", head: true })
      .eq("assembly_id", assemblyId)
      .eq("is_active", true)
      .is("deleted_at", null);
    ministryTotal = count ?? 0;
  }

  return {
    memberTotal: members.length,
    newThisMonth,
    cellTotal,
    ministryTotal,
    avgAttendance,
    lastAttendance: attendanceTrend.at(-1)?.present ?? null,
    attendanceTrend,
    growth,
    birthdaysThisMonth,
    anniversariesThisMonth,
    unassignedMembers: members.filter((m) => !m.home_cell_id).length,
    cellsWithoutRecentReport,
  };
}
