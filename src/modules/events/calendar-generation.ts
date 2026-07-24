import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/shared/rbac/can";
import { requirePermission } from "@/shared/rbac/can";
import { AppError, err, ok, type Result } from "@/shared/errors/result";
import { monthCalendar } from "@/lib/calendar/cop-calendar";

/**
 * Generates the assembly's Events for a month from the liturgical calendar
 * (docs/17). Officers get Home Cell, Youth meetings, the full Ministries Week
 * (incl. Dunamis Fire), Gospel Sunday and the Lord's Supper week without typing
 * a single date.
 *
 * IDEMPOTENT: an event is created only if one with the same title does not
 * already exist on that day, so re-running a month never duplicates and never
 * clobbers manual edits.
 *
 * Ghana is UTC+0 year-round, so a wall-clock time in Accra is the same instant
 * in UTC — `${date}T07:00:00Z` is genuinely 7am Accra.
 */

const MORNING = { start: "07:00:00", end: "09:30:00" }; // Sunday services
const EVENING = { start: "19:00:00", end: "20:30:00" }; // weekday meetings

interface EventSpec {
  title: string;
  date: string; // YYYY-MM-DD
  slot: typeof MORNING | typeof EVENING;
  location?: string;
  ministryCode?: string;
}

function buildSpecs(year: number, month0: number): EventSpec[] {
  const cal = monthCalendar(year, month0);
  const specs: EventSpec[] = [];

  // Home Cell — 1st Monday (evening).
  specs.push({ title: "Home Cell", date: cal.homeCellMonday, slot: EVENING });

  // Youth — every other Monday, EXCLUDING the Ministries-Week Monday (which is
  // captured as a Ministries-Week event below, so it isn't listed twice).
  for (const date of cal.youthMondays) {
    if (date === cal.ministriesWeek.monday) continue;
    specs.push({ title: "Youth Meeting", date, slot: EVENING });
  }

  // Ministries Week.
  for (const day of cal.ministriesWeek.days) {
    switch (day.weekday) {
      case "Monday":
        specs.push({ title: "Ministries Week — Youth", date: day.date, slot: EVENING, ministryCode: "YOUTH" });
        break;
      case "Tuesday":
        specs.push({ title: "Ministries Week — Women's Ministry", date: day.date, slot: EVENING, ministryCode: "WOMEN" });
        break;
      case "Wednesday":
        specs.push({ title: "Ministries Week — Evangelism", date: day.date, slot: EVENING, ministryCode: "EVANGELISM" });
        break;
      case "Thursday":
        specs.push({ title: "Ministries Week — Men's Ministry", date: day.date, slot: EVENING, ministryCode: "PEMEM" });
        break;
      case "Friday":
        specs.push({ title: "Dunamis Fire (District Joint Service)", date: day.date, slot: EVENING, location: "Central church" });
        break;
      case "Sunday":
        specs.push({ title: "Gospel Sunday", date: day.date, slot: MORNING });
        break;
    }
  }

  // Lord's Supper week — Tue–Sat preparation, Sunday the Lord's Supper.
  for (const day of cal.lordsSupperWeek.days) {
    if (day.weekday === "Sunday") {
      specs.push({ title: "Lord's Supper Sunday", date: day.date, slot: MORNING });
    } else {
      specs.push({ title: "Lord's Supper Preparation", date: day.date, slot: EVENING });
    }
  }

  return specs;
}

export async function generateMonthEvents(
  ctx: AuthContext,
  year: number,
  month0: number,
): Promise<Result<{ created: number; skipped: number; total: number }>> {
  requirePermission(ctx, "event.write");
  if (!ctx.assemblyId) return err(AppError.forbidden("No active assembly"));

  const specs = buildSpecs(year, month0);
  if (specs.length === 0) return ok({ created: 0, skipped: 0, total: 0 });

  const supabase = await createClient();
  const dates = specs.map((s) => s.date).sort();
  const rangeStart = `${dates[0]}T00:00:00.000Z`;
  const rangeEnd = `${dates[dates.length - 1]}T23:59:59.999Z`;

  // Existing events in range → dedupe key "title|date".
  const { data: existing, error: existingErr } = await supabase
    .from("event")
    .select("title, starts_at")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null)
    .gte("starts_at", rangeStart)
    .lte("starts_at", rangeEnd);

  if (existingErr) throw new Error(`Failed to check events: ${existingErr.message}`);

  const seen = new Set(
    (existing ?? []).map((e) => `${e.title}|${e.starts_at.slice(0, 10)}`),
  );

  // Ministry code → id, for linking Ministries-Week events to the ministry.
  const { data: ministries } = await supabase
    .from("ministry")
    .select("id, code")
    .eq("assembly_id", ctx.assemblyId)
    .is("deleted_at", null);
  const ministryByCode = new Map(
    (ministries ?? []).filter((m) => m.code).map((m) => [m.code as string, m.id]),
  );

  const toInsert = specs
    .filter((s) => !seen.has(`${s.title}|${s.date}`))
    .map((s) => ({
      assembly_id: ctx.assemblyId as string,
      title: s.title,
      location: s.location ?? null,
      starts_at: `${s.date}T${s.slot.start}.000Z`,
      ends_at: `${s.date}T${s.slot.end}.000Z`,
      ministry_id: s.ministryCode ? (ministryByCode.get(s.ministryCode) ?? null) : null,
      visibility: "assembly" as const,
      status: "scheduled" as const,
      requires_registration: false,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }));

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from("event").insert(toInsert);
    if (insertErr) throw new Error(`Failed to create events: ${insertErr.message}`);
  }

  return ok({
    created: toInsert.length,
    skipped: specs.length - toInsert.length,
    total: specs.length,
  });
}
