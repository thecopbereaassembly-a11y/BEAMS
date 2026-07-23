# 17 — Liturgical Calendar (Berea English Assembly)

> **Artifact:** The assembly's monthly rhythm, as given by the client, encoded as
> tested logic in [`src/lib/calendar/cop-calendar.ts`](../src/lib/calendar/cop-calendar.ts).
> This is the source of truth — the code implements this document.

---

## The monthly cycle

Every month follows the same shape. It cannot be expressed as a fixed weekly day
(so it is **not** a `service_type.default_day`); it is a monthly pattern, and is
computed rather than stored.

| Occasion | When |
|---|---|
| **Home Cell** | 1st **Monday** of the month |
| **Youth meeting** | every **other Monday** (all Mondays except the 1st) |
| **Lord's Supper Sunday** | 1st **Sunday** of the month — this closes the *previous* month's cycle |
| **Ministries Week** | the **last week (Mon–Sun)** of the month |
| **Gospel Sunday** | the **last Sunday** of the month (the Sunday of Ministries Week) |

### Ministries Week (once a month, last week)

| Day | Focus |
|---|---|
| Monday | Youth Ministry |
| Tuesday | Women's Ministry |
| Wednesday | Evangelism Ministry |
| Thursday | Pentecost Men's Ministry |
| Friday | District / Area joint service (as arranged) |
| Sunday | **Gospel Sunday** |

*(Saturday carries no ministry assignment.)*

### The hand-off to the next month

Gospel Sunday (last Sunday of month **M**) is always followed one week later by
**Lord's Supper Sunday** — the 1st Sunday of month **M+1**. They are always
exactly 7 days apart.

> **Worked example (the client's own):** May's Gospel Sunday is **31 May 2026**;
> its Lord's Supper Sunday is **7 June 2026** — the first Sunday of June.

## What the code provides

`monthCalendar(year, month)` returns, for any month, the computed dates:
`lordsSupperSunday`, `homeCellMonday`, `youthMondays[]`, the full `ministriesWeek`
(each day with its ministry focus), and `nextLordsSupperSunday`. All UTC/date-only,
covered by 11 unit tests including the July-2026 hand-verified anchor, the client's
May example, and a full-year invariant check.

## One point awaiting confirmation

The client mentioned the Lord's Supper "week … from Tuesday to Sunday". The
**Sunday** anchor (1st Sunday of the next month) is implemented and verified.
Whether there are distinct weekday observances *during* that Lord's Supper week
(Tue–Sat) is not yet modelled — to be confirmed.

## Not yet wired in

The calendar engine exists and is tested, but is **not** yet generating Events or
attendance sessions automatically. Confirm the point above, then decide whether
to: (a) auto-generate the month's events, (b) show a "this month" widget on the
dashboard, or (c) leave it as a library other features call. See the open
question before building UI on top.
