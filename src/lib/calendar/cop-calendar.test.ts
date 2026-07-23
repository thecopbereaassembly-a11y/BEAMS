import { describe, it, expect } from "vitest";
import {
  lordsSupperSunday,
  gospelSunday,
  homeCellMonday,
  youthMondays,
  ministriesWeek,
  monthCalendar,
  toISODate,
} from "./cop-calendar";

// July 2026 (month index 6) — anchored to a hand-verified calendar:
//   1 Jul = Wed · Sundays 5,12,19,26 · Mondays 6,13,20,27.
const JUL = 6;

describe("July 2026 (hand-verified anchor)", () => {
  it("Lord's Supper Sunday is the 1st Sunday", () => {
    expect(toISODate(lordsSupperSunday(2026, JUL))).toBe("2026-07-05");
  });

  it("Gospel Sunday is the last Sunday", () => {
    expect(toISODate(gospelSunday(2026, JUL))).toBe("2026-07-26");
  });

  it("Home Cell is the 1st Monday", () => {
    expect(toISODate(homeCellMonday(2026, JUL))).toBe("2026-07-06");
  });

  it("Youth meets every Monday except the 1st", () => {
    expect(youthMondays(2026, JUL).map(toISODate)).toEqual([
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
  });

  it("Ministries Week is Mon 20 → Gospel Sunday 26 with the right focuses", () => {
    const week = ministriesWeek(2026, JUL);
    expect(week.monday).toBe("2026-07-20");
    expect(week.gospelSunday).toBe("2026-07-26");
    expect(week.days).toEqual([
      { date: "2026-07-20", weekday: "Monday", focus: "Youth Ministry" },
      { date: "2026-07-21", weekday: "Tuesday", focus: "Women's Ministry" },
      { date: "2026-07-22", weekday: "Wednesday", focus: "Evangelism Ministry" },
      { date: "2026-07-23", weekday: "Thursday", focus: "Pentecost Men's Ministry" },
      { date: "2026-07-24", weekday: "Friday", focus: "District / Area joint service (as arranged)" },
      { date: "2026-07-26", weekday: "Sunday", focus: "Gospel Sunday" },
    ]);
  });

  it("the NEXT Lord's Supper Sunday follows Gospel Sunday by exactly a week", () => {
    // Gospel Sunday 26 Jul → Lord's Supper 2 Aug.
    expect(monthCalendar(2026, JUL).nextLordsSupperSunday).toBe("2026-08-02");
  });
});

describe("the client's own example: May → Lord's Supper in June", () => {
  it("May's cycle ends on the 1st Sunday of June", () => {
    const may = monthCalendar(2026, 4); // May
    const juneFirstSunday = toISODate(lordsSupperSunday(2026, 5));
    expect(may.nextLordsSupperSunday).toBe(juneFirstSunday);
    // …and that is exactly 7 days after May's Gospel Sunday.
    const gospel = new Date(`${may.ministriesWeek.gospelSunday}T00:00:00Z`);
    const supper = new Date(`${may.nextLordsSupperSunday}T00:00:00Z`);
    expect((supper.getTime() - gospel.getTime()) / 86_400_000).toBe(7);
  });
});

describe("structural invariants across a full year", () => {
  it("Gospel Sunday and the next Lord's Supper Sunday are always 7 days apart", () => {
    for (let m = 0; m < 12; m += 1) {
      const cal = monthCalendar(2026, m);
      const gospel = new Date(`${cal.ministriesWeek.gospelSunday}T00:00:00Z`);
      const supper = new Date(`${cal.nextLordsSupperSunday}T00:00:00Z`);
      expect((supper.getTime() - gospel.getTime()) / 86_400_000).toBe(7);
    }
  });

  it("Ministries Week always runs Monday → Sunday (6 days span)", () => {
    for (let m = 0; m < 12; m += 1) {
      const w = ministriesWeek(2026, m);
      const mon = new Date(`${w.monday}T00:00:00Z`);
      const sun = new Date(`${w.gospelSunday}T00:00:00Z`);
      expect((sun.getTime() - mon.getTime()) / 86_400_000).toBe(6);
    }
  });

  it("handles a month with five Mondays (four youth Mondays)", () => {
    // March 2027 has Mondays 1,8,15,22,29.
    const youth = youthMondays(2027, 2);
    expect(youth).toHaveLength(4);
    expect(toISODate(homeCellMonday(2027, 2))).toBe("2027-03-01");
  });

  it("handles February correctly (short month)", () => {
    const feb = monthCalendar(2026, 1);
    expect(feb.ministriesWeek.gospelSunday.startsWith("2026-02")).toBe(true);
    expect(feb.nextLordsSupperSunday.startsWith("2026-03")).toBe(true);
  });
});
