import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import { findReport, type ReportDefinition } from "../registry";
import { ageFrom, displayName } from "@/modules/membership";

export type ReportRow = Record<string, string | number | null>;

export interface ReportResult {
  definition: ReportDefinition;
  rows: ReportRow[];
  generatedAt: string;
}

const yesNo = (v: boolean | null) => (v ? "Yes" : "No");
const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra" }) : "";

/**
 * Runs a report by key. Every report is permission-checked against its own
 * declaration, so the export routes inherit the same rule as the UI.
 */
export async function runReport(
  ctx: AuthContext,
  key: string,
): Promise<Result<ReportResult>> {
  const definition = findReport(key);
  if (!definition) return err(AppError.notFound("Unknown report"));

  requirePermission(ctx, definition.permission);
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const supabase = await createClient();
  const assemblyId = ctx.assemblyId;
  let rows: ReportRow[] = [];

  switch (key) {
    case "members": {
      const [{ data: members }, { data: cells }] = await Promise.all([
        supabase
          .from("member")
          .select("*")
          .eq("assembly_id", assemblyId)
          .is("deleted_at", null)
          .order("last_name"),
        supabase.from("home_cell").select("id, name").eq("assembly_id", assemblyId),
      ]);
      const cellName = new Map((cells ?? []).map((c) => [c.id, c.name]));
      rows = (members ?? []).map((m) => ({
        name: displayName(m),
        status: m.current_status,
        gender: m.gender ?? "",
        phone: m.primary_phone ?? "",
        email: m.primary_email ?? "",
        home_cell: m.home_cell_id ? (cellName.get(m.home_cell_id) ?? "") : "",
        joined_on: date(m.joined_on),
        water_baptized: yesNo(m.is_water_baptized),
        holy_spirit_baptized: yesNo(m.is_holy_spirit_baptized),
      }));
      break;
    }

    case "birthdays": {
      const { data: members } = await supabase
        .from("member")
        .select("*")
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .not("date_of_birth", "is", null);
      rows = (members ?? [])
        .map((m) => {
          const dob = new Date(m.date_of_birth as string);
          return {
            _sort: dob.getMonth() * 100 + dob.getDate(),
            name: displayName(m),
            date: dob.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              timeZone: "Africa/Accra",
            }),
            age: ageFrom(m.date_of_birth) ?? "",
            phone: m.primary_phone ?? "",
          };
        })
        .sort((a, b) => (a._sort as number) - (b._sort as number))
        .map(({ _sort: _omit, ...rest }) => rest);
      break;
    }

    case "attendance": {
      const { data: sessions } = await supabase
        .from("attendance_session")
        .select("id, service_date, service_type_id, title")
        .eq("assembly_id", assemblyId)
        .is("deleted_at", null)
        .order("service_date", { ascending: false });

      if (sessions?.length) {
        const [{ data: types }, { data: records }] = await Promise.all([
          supabase.from("service_type").select("id, name").eq("assembly_id", assemblyId),
          supabase
            .from("attendance_record")
            .select("session_id, status")
            .in("session_id", sessions.map((s) => s.id)),
        ]);
        const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));

        const tally = (records ?? []).reduce<Record<string, { p: number; a: number }>>(
          (acc, r) => {
            const bucket = (acc[r.session_id] ??= { p: 0, a: 0 });
            if (r.status === "present" || r.status === "late") bucket.p += 1;
            else if (r.status === "absent") bucket.a += 1;
            return acc;
          },
          {},
        );

        rows = sessions.map((s) => {
          const t = tally[s.id] ?? { p: 0, a: 0 };
          return {
            date: date(s.service_date),
            service: s.title || typeName.get(s.service_type_id) || "Service",
            present: t.p,
            absent: t.a,
            marked: t.p + t.a,
          };
        });
      }
      break;
    }

    case "home-cells": {
      const [{ data: cells }, { data: links }] = await Promise.all([
        supabase
          .from("home_cell")
          .select("*")
          .eq("assembly_id", assemblyId)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("home_cell_member")
          .select("home_cell_id")
          .eq("assembly_id", assemblyId)
          .eq("is_active", true),
      ]);
      const counts = (links ?? []).reduce<Record<string, number>>((acc, l) => {
        acc[l.home_cell_id] = (acc[l.home_cell_id] ?? 0) + 1;
        return acc;
      }, {});
      rows = (cells ?? []).map((c) => ({
        name: c.name,
        code: c.code ?? "",
        members: counts[c.id] ?? 0,
        meeting: [c.meeting_day, c.meeting_time?.slice(0, 5)].filter(Boolean).join(" "),
        location: c.location ?? "",
        active: yesNo(c.is_active),
      }));
      break;
    }

    case "cell-reports": {
      const [{ data: reports }, { data: cells }] = await Promise.all([
        supabase
          .from("home_cell_report")
          .select("*")
          .eq("assembly_id", assemblyId)
          .is("deleted_at", null)
          .order("report_date", { ascending: false }),
        supabase.from("home_cell").select("id, name").eq("assembly_id", assemblyId),
      ]);
      const cellName = new Map((cells ?? []).map((c) => [c.id, c.name]));
      rows = (reports ?? []).map((r) => ({
        date: date(r.report_date),
        cell: cellName.get(r.home_cell_id) ?? "",
        attendance: r.attendance_count ?? 0,
        visitors: r.visitors_count ?? 0,
        offering: Number(r.offering_amount ?? 0),
      }));
      break;
    }

    case "ministries": {
      const [{ data: ministries }, { data: links }] = await Promise.all([
        supabase
          .from("ministry")
          .select("*")
          .eq("assembly_id", assemblyId)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("ministry_member")
          .select("ministry_id")
          .eq("assembly_id", assemblyId)
          .eq("is_active", true),
      ]);
      const counts = (links ?? []).reduce<Record<string, number>>((acc, l) => {
        acc[l.ministry_id] = (acc[l.ministry_id] ?? 0) + 1;
        return acc;
      }, {});
      rows = (ministries ?? []).map((m) => ({
        name: m.name,
        code: m.code ?? "",
        category: m.category ?? "",
        members: counts[m.id] ?? 0,
        active: yesNo(m.is_active),
      }));
      break;
    }

    case "leadership": {
      const { data: appointments } = await supabase
        .from("leadership_appointment")
        .select("member_id, position_id, portfolio, appointed_on, ordained_on")
        .eq("assembly_id", assemblyId)
        .eq("is_current", true)
        .is("deleted_at", null);

      if (appointments?.length) {
        const [{ data: members }, { data: positions }] = await Promise.all([
          supabase
            .from("member")
            .select("id, first_name, last_name, preferred_name")
            .in("id", appointments.map((a) => a.member_id)),
          supabase
            .from("leadership_position")
            .select("id, name, rank")
            .in("id", appointments.map((a) => a.position_id)),
        ]);
        const memberById = new Map((members ?? []).map((m) => [m.id, m]));
        const positionById = new Map((positions ?? []).map((p) => [p.id, p]));

        rows = appointments
          .map((a) => {
            const m = memberById.get(a.member_id);
            const p = positionById.get(a.position_id);
            if (!m || !p) return null;
            return {
              _rank: p.rank,
              name: displayName(m),
              office: p.name,
              portfolio: a.portfolio ?? "",
              appointed_on: date(a.appointed_on),
              ordained_on: date(a.ordained_on),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => (a._rank as number) - (b._rank as number))
          .map(({ _rank: _omit, ...rest }) => rest);
      }
      break;
    }

    default:
      return err(AppError.notFound("Unknown report"));
  }

  return ok({ definition, rows, generatedAt: new Date().toISOString() });
}
