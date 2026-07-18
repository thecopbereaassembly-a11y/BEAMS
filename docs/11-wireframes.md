# 11 — Wireframes & Screen Inventory

> **Artifact:** Low-fidelity wireframes for the key screens, so we agree on layout
> and interaction before pixels. Rendered as ASCII (diffable, unambiguous). High-
> fidelity Figma/artifact can follow on request. **Owner:** UI/UX Designer.
> **Status:** Phase 4 — in review.

Conventions: `[ Button ]` · `( ) ` radio · `[x]` checkbox · `▼` select ·
`🔍` search · `⌘K` command palette · `≡` menu. Desktop shown; mobile notes follow
each screen.

---

## 0. App Shell (persistent frame)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [≡] BEAMS · Berea English          🔍 Search or ⌘K …        🔔3  ☾  (JD)▼ │  top bar
├───────────┬───────────────────────────────────────────────────────────────┤
│ ⌂ Dashboard│  Home › Members › Kwame Mensah                                │  breadcrumbs
│ 👥 Members │ ┌─────────────────────────────────────────────────────────┐  │
│ 🏠 Families│ │                                                         │  │
│ 🔵 Cells   │ │                 « screen content »                      │  │
│ ✝ Ministrs │ │                                                         │  │
│ 🧭 Shepherd│ │                                                         │  │
│ 📅 Events  │ │                                                         │  │
│ 💰 Finance │ │                                                         │  │
│ 📊 Reports │ │                                                         │  │
│ ⚙ Settings │ └─────────────────────────────────────────────────────────┘  │
│  ─────────  │                                                               │
│ [ + New ▾ ] │                                                               │
└───────────┴───────────────────────────────────────────────────────────────┘
```

- Sidebar collapses to icons (`lg` down) → drawer/bottom-tabs on mobile.
- Nav items are **permission-filtered** — Finance hidden if no `finance.*`.
- Offline: a thin amber `ConnectivityBanner` slides under the top bar with a
  "3 changes pending sync" pill.
- **Mobile:** top bar (menu, search, bell) + bottom tab bar (Dashboard, Members,
  Attendance, More). `+ New` is a FAB.

---

## 1. Dashboard (role-aware)

```
┌ Dashboard ─────────────────────────────────────────  [ This month ▼ ] [⤓] ┐
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ Members  │ │ Avg Att. │ │ Visitors │ │ Follow-  │   KPI tiles (count-up) │
│ │  1,240   │ │   612    │ │   18 new │ │ ups  23  │                        │
│ │ ▲ 2.1%   │ │ ▲ 4.0%   │ │ this wk  │ │ pending  │                        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                        │
│ ┌ Attendance trend ─────────────────┐ ┌ Pending follow-ups ──────────────┐ │
│ │   ╭╮   ╭─╮      Recharts line      │ │ • Ama O.  absent 4 wks   [Assign]│ │
│ │  ╭╯╰──╯ ╰─╮   (accessible table    │ │ • Yaw K.  new visitor    [Call]  │ │
│ │ ╯         ╰   behind)              │ │ • Efua M. new convert    [Visit] │ │
│ └───────────────────────────────────┘ └──────────────────────────────────┘ │
│ ┌ Birthdays 🎂 ─────┐ ┌ Upcoming events ──┐ ┌ Prayer & Welfare ──────────┐ │
│ │ Kofi (today) [SMS]│ │ Sun · Service     │ │ 5 open prayer · 2 welfare  │ │
│ │ Adjoa (Fri)       │ │ Wed · Home Cells  │ │ cases                      │ │
│ └───────────────────┘ └───────────────────┘ └────────────────────────────┘ │
│ ┌ Recent activity ────────────────────────────────────────────────────────┐│
│ │ SEC added member "J. Owusu" · HCL logged Cell 4 attendance · …           ││
│ └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

Widgets are cards; a member/HCL sees a lighter set. Each KPI links to its module.

---

## 2. Members — List

```
┌ Members ───────────────────────────────────────────────────  [ + New member ] ┐
│ 🔍 Search name/phone…   [ Status ▼ ] [ Home Cell ▼ ] [ Ministry ▼ ] [⚙][⤓Export]│
│ ┌──────────────────────────────────────────────────────────────────────────┐  │
│ │ ☐  Photo  Name             Cell        Status     Phone         •••       │  │
│ │ ☐  (KM)   Kwame Mensah      Cell 3      Member     +233 24…      ⋯         │  │
│ │ ☐  (AO)   Ama Owusu         Cell 1      New conv.  +233 20…      ⋯         │  │
│ │ ☐  (EA)   Efua Addo         —           Visitor    +233 55…      ⋯         │  │
│ │ …  (virtualized rows)                                                      │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
│ 3 selected → [ SMS ] [ Assign to cell ] [ Add tag ] [ Export ]   ‹ 1 2 3 … ›  │
└────────────────────────────────────────────────────────────────────────────────┘
```

Skeleton rows while loading; empty state teaches import. Bulk toolbar appears on
selection. **Mobile:** cards, not a table; filters in a bottom sheet.

---

## 3. Member — Profile (tabbed)

```
┌ ‹ Kwame Mensah ───────────────────────────────  [ Edit ] [ ⋯ ] ┐
│ (KM)  Kwame Mensah          [Member] [Water✓] [Holy Spirit✓]   │
│ 📞 +233 24 123 4567 · 🏠 Cell 3 · ✝ Men's Ministry (PEMEM)      │
│ ┌ Overview | Family | Attendance | Giving | Care | Prayer |     │
│ │           Documents | Timeline | Audit | Notes │              │
│ ├──────────────────────────────────────────────────────────────┤
│ │  Personal            Occupation          Discipleship         │
│ │  DOB 12/04/1988      Teacher, GES        Water: 03/2015       │
│ │  Married · Ghanaian  ─────────────       Holy Spirit: 06/2016 │
│ │  GPS GA-123-4567     Emergency contact   Joined: 2014         │
│ │                      Akua M. +233…                            │
│ └──────────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────┘
```

Confidential tabs (Care) render only with permission. Timeline = activity feed;
Audit tab = who-changed-what (for authorized roles).

---

## 4. Attendance — Capture (offline-first, the make-or-break screen)

```
┌ Attendance › Sunday Service · 21/07/2026 ───────  ⚠ Offline · saves locally ┐
│ Service: [ Sunday Service ▼ ]   Date: [ 21/07/2026 ]   [ Headcount mode ⇄ ] │
│ 🔍 Quick find member…                              Present: 148   Absent: 12 │
│ ┌──────────────────────────────────────────────────────────────────────────┐│
│ │  ✓  Kwame Mensah        Cell 3          [ Present �absent ·excused ]       ││
│ │  ✓  Ama Owusu           Cell 1          [ ✓Present absent excused ]       ││
│ │  ○  Efua Addo           Cell 2          [ present ✓absent excused ]       ││
│ │  … big 44px tap targets, one thumb, no scroll-jank                        ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│ [ + Add visitor ]                           [ Save ]  ● 3 pending sync       │
└─────────────────────────────────────────────────────────────────────────────┘
```

Marks queue to IndexedDB instantly; the "pending sync" pill flushes on reconnect.
Headcount mode swaps the roster for men/women/youth/children counters (big steppers).

---

## 5. Finance — Record Contribution (MoMo-first)

```
┌ Finance › New contribution ───────────────────────────────────────┐
│ Member    [ 🔍 Kwame Mensah         ▼ ]   ( ) Anonymous offering   │
│ Type      [ Tithe ▼ ]     Fund [ General ▼ ]   Date [21/07/2026]   │
│ Channel   ( ●MoMo ) ( Cash ) ( Bank )                              │
│   Network [ MTN ▼ ]   Payer MSISDN [ +233 24… ]  Ref [ TXN… ]      │
│ Amount    GHS [ 200.00 ]                                          │
│ Note      [ …                                       ]              │
│ [ Cancel ]                          [ Save & new ] [ Save + receipt ]│
└───────────────────────────────────────────────────────────────────┘
```

Batch mode (offering count) shows a fast repeat-entry list with a running total
vs. expected. Receipt can be SMS/emailed. Screen visible only with `finance.write`.

---

## 6. Shepherding — Follow-up Queue

```
┌ Shepherding ──────────────  [ Mine ] [ All ]  [ Reason ▼ ] [ Priority ▼ ] ┐
│ ┌ Open (23) ─┐ ┌ In progress (8) ┐ ┌ Completed ─┐   (Kanban or list view)  │
│ │ Ama O.     │ │ Yaw K.          │ │ …          │                          │
│ │ absent 4wk │ │ new visitor     │ │            │                          │
│ │ 🔴 urgent  │ │ 🟡 normal       │ │            │                          │
│ │ [Assign]   │ │ assigned: EL J. │ │            │                          │
│ └────────────┘ └─────────────────┘ └────────────┘                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

Auto-populated by absentee sweeps / new visitors / new converts. Tapping a card
opens contact-log (call/visit/SMS) with one-tap "Log activity".

---

## 7. Communication — New SMS/Email campaign

```
┌ Communication › New message ───────────────────────────────────────┐
│ Channel ( ●SMS ) ( Email )     Template [ Birthday wish ▼ ]         │
│ To:  Segment [ Absentees (4+ wks) ▼ ]   → 12 recipients  [Preview]  │
│ Message                                                            │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Hi {{first_name}}, we missed you at church. …   (152 chars/1 SMS)│ │
│ └────────────────────────────────────────────────────────────────┘ │
│ Est. cost: GHS 1.20 · 12 msgs         [ Save draft ] [ Schedule ] [ Send ]│
└───────────────────────────────────────────────────────────────────┘
```

Opt-outs auto-excluded (consent). Cost estimate before send; delivery report after.

---

## 8. Admin — Roles & Permissions (the configurable matrix)

```
┌ Settings › Roles ─────────────────────────────  [ + New role ]     ┐
│ Roles              │  Permissions for: Home Cell Leader             │
│ • Presiding Elder  │  Search perms 🔍                               │
│ • Elder            │  Membership   [x] read  [ ] write  [ ] delete  │
│ • Home Cell Leader◄│  Home Cells   [x] read  [x] write              │
│ • Financial Sec.   │  Attendance   [x] read  [x] write              │
│ • Member           │  Shepherding  [x] read  [x] write              │
│ • Auditor          │  Finance 🔒   [ ] read  [ ] write              │
│                    │  … (grouped by module)      [ Reset to default ]│
│                    │                              [ Save changes ]   │
└────────────────────┴────────────────────────────────────────────────┘
```

Edits write per-assembly `role_permission` overrides — live, audited, reversible.

---

## Screen inventory (per module — all follow the List/Detail/Form patterns)

Dashboard · Members (list/profile/new/edit/import) · Families · Home Cells
(list/detail/report) · Ministries · Leadership · Visitors (pipeline) · Attendance
(capture/sessions/history) · Shepherding (queue/detail) · Counselling 🔒 · Welfare
🔒 · Evangelism · Events (calendar/detail/registration) · Finance
(contributions/batches/expenditure/pledges/receipts) · Prayer (wall/manage) ·
Communication (compose/campaigns/templates) · Documents · Assets · Reports
(builder/schedules) · Notifications · Activity Logs · Settings · Admin (users/
roles/assembly) · Auth (login/reset). **≈ 60 screens**, all from ~8 page patterns.
