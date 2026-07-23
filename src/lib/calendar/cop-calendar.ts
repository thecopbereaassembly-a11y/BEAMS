/**
 * The Church of Pentecost — Berea English Assembly liturgical calendar.
 *
 * Encodes the monthly rhythm exactly as described by the assembly:
 *
 *  · 1st Monday of the month      → Home Cell
 *  · every OTHER Monday           → Youth meeting
 *  · 1st Sunday of the month      → Lord's Supper Sunday (closes the PREVIOUS
 *                                    month's cycle)
 *  · last week of the month (Mon–Sun) → MINISTRIES WEEK:
 *        Mon Youth · Tue Women · Wed Evangelism · Thu Men ·
 *        Fri District/Area joint (as arranged) · Sun = GOSPEL SUNDAY
 *  · Gospel Sunday is the last Sunday of the month; the following Sunday
 *    (1st Sunday of the next month) is that cycle's Lord's Supper Sunday.
 *
 * All computation is UTC/date-only (no time-of-day, no timezone drift). Month
 * arguments are 0-indexed (January = 0) to match JavaScript's Date.
 */

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SUNDAY = 0;
const MONDAY = 1;

/** 'YYYY-MM-DD' from the UTC parts of a date. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utc(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

/** The n-th occurrence (1-based) of `weekday` in the month. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const firstDow = utc(year, month0, 1).getUTCDay();
  const offset = (weekday - firstDow + 7) % 7;
  return utc(year, month0, 1 + offset + (n - 1) * 7);
}

/** The last occurrence of `weekday` in the month. */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const lastDay = utc(year, month0 + 1, 0).getUTCDate();
  const lastDow = utc(year, month0, lastDay).getUTCDay();
  const offset = (lastDow - weekday + 7) % 7;
  return utc(year, month0, lastDay - offset);
}

/** Every Monday that falls within the month. */
function mondaysOf(year: number, month0: number): Date[] {
  const out: Date[] = [];
  const first = nthWeekday(year, month0, MONDAY, 1);
  for (let d = first; d.getUTCMonth() === month0; ) {
    out.push(new Date(d));
    d = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7);
  }
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Lord's Supper Sunday for the cycle that ENDS in this month (its 1st Sunday). */
export function lordsSupperSunday(year: number, month0: number): Date {
  return nthWeekday(year, month0, SUNDAY, 1);
}

/** Gospel Sunday — the last Sunday of the month, closing Ministries Week. */
export function gospelSunday(year: number, month0: number): Date {
  return lastWeekday(year, month0, SUNDAY);
}

/** Home Cell Monday — the 1st Monday of the month. */
export function homeCellMonday(year: number, month0: number): Date {
  return nthWeekday(year, month0, MONDAY, 1);
}

/** Youth meeting Mondays — every Monday EXCEPT the 1st (Home Cell) Monday. */
export function youthMondays(year: number, month0: number): Date[] {
  return mondaysOf(year, month0).slice(1);
}

export interface MinistriesDay {
  date: string;
  weekday: string;
  focus: string;
}

/**
 * Ministries Week — the Mon–Sun week that ends on Gospel Sunday (the month's
 * last Sunday). Saturday is intentionally omitted; the assembly assigns no
 * ministry to it.
 */
export function ministriesWeek(year: number, month0: number): {
  gospelSunday: string;
  monday: string;
  days: MinistriesDay[];
} {
  const gospel = gospelSunday(year, month0);
  const monday = utc(
    gospel.getUTCFullYear(),
    gospel.getUTCMonth(),
    gospel.getUTCDate() - 6,
  );

  const focusByOffset: Record<number, string> = {
    0: "Youth Ministry", // Monday
    1: "Women's Ministry", // Tuesday
    2: "Evangelism Ministry", // Wednesday
    3: "Pentecost Men's Ministry", // Thursday
    4: "District / Area joint service (as arranged)", // Friday
    6: "Gospel Sunday", // Sunday
  };

  const days: MinistriesDay[] = Object.entries(focusByOffset)
    .map(([offset, focus]) => {
      const d = utc(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate() + Number(offset),
      );
      return { date: toISODate(d), weekday: WEEKDAY_NAMES[d.getUTCDay()] ?? "", focus };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { gospelSunday: toISODate(gospel), monday: toISODate(monday), days };
}

export interface MonthCalendar {
  year: number;
  month: number; // 0-indexed
  lordsSupperSunday: string; // 1st Sunday this month (previous cycle)
  homeCellMonday: string;
  youthMondays: string[];
  ministriesWeek: ReturnType<typeof ministriesWeek>;
  /** The Lord's Supper Sunday that FOLLOWS this month's Gospel Sunday. */
  nextLordsSupperSunday: string;
}

/** Everything for one month, ready to render or to generate events from. */
export function monthCalendar(year: number, month0: number): MonthCalendar {
  const nextMonth = month0 === 11 ? 0 : month0 + 1;
  const nextYear = month0 === 11 ? year + 1 : year;

  return {
    year,
    month: month0,
    lordsSupperSunday: toISODate(lordsSupperSunday(year, month0)),
    homeCellMonday: toISODate(homeCellMonday(year, month0)),
    youthMondays: youthMondays(year, month0).map(toISODate),
    ministriesWeek: ministriesWeek(year, month0),
    nextLordsSupperSunday: toISODate(lordsSupperSunday(nextYear, nextMonth)),
  };
}
