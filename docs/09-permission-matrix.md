# 09 — Permission Matrix (RBAC)

> **Artifact:** The canonical permission catalog, the 14 roles, and the default
> role→permission grants. Executable form: [`96_seed_rbac.sql`](./schema/96_seed_rbac.sql).
> **Owner:** Security Engineer + Product. **Status:** Phase 3 — in review.

Every grant here is a **default** written to `role_permission` with
`assembly_id = null`. An assembly admin can override any grant at runtime (a row
with their `assembly_id`), which is your "every role must have configurable
permissions" requirement — no deploy needed.

---

## 1. Permission catalog

Keys are `module.action`. `read` = read all rows in the assembly; `write` =
create/update; `delete` = soft-delete/restore; `export` = generate exports;
`manage` = administrative control. `🔒` = sensitive (extra-audited; confidential
RLS).

| Module | Permissions |
|---|---|
| Dashboard | `dashboard.view` |
| Membership | `member.read` · `member.write` · `member.delete` · `member.export` |
| Families | `family.read` · `family.write` |
| Home Cells | `homecell.read` · `homecell.write` |
| Ministries | `ministry.read` · `ministry.write` |
| Leadership | `leadership.read` · `leadership.write` |
| Visitors | `visitor.read` · `visitor.write` |
| Attendance | `attendance.read` · `attendance.write` |
| Shepherding | `shepherding.read` · `shepherding.write` |
| Counselling 🔒 | `counselling.read` · `counselling.write` |
| Welfare 🔒 | `welfare.read` · `welfare.write` |
| Evangelism | `evangelism.read` · `evangelism.write` |
| Events | `event.read` · `event.write` |
| Prayer | `prayer.read` · `prayer.write` |
| Finance 🔒 | `finance.read` · `finance.write` · `finance.export` |
| Communication | `communication.read` · `communication.write` |
| Documents | `document.read` · `document.write` |
| Assets | `asset.read` · `asset.write` |
| Reports | `report.read` · `report.write` · `report.export` |
| Settings | `settings.read` · `settings.write` |
| User Mgmt | `user.manage` 🔒 · `role.manage` 🔒 |
| Audit | `audit.read` 🔒 |
| AI Assistant | `assistant.use` (feature-flagged off in V1) |

## 2. Roles (14)

`super_admin` bypasses checks (`is_super_admin`) **and** holds every permission.
The rest are ranked (lower = higher authority) and are system roles.

| Role | Key | Rank | Essence |
|---|---|--:|---|
| Super Administrator | `super_admin` | 10 | Platform owner; everything |
| District Pastor | `district_pastor` | 20 | Oversight + pastoral care (incl. confidential read/write), reports |
| Presiding Elder | `presiding_elder` | 30 | Full assembly admin incl. user management |
| Elder | `elder` | 40 | Broad ministry ops (no finance/confidential by default) |
| Deacon | `deacon` | 50 | Member care + **welfare** + attendance |
| Deaconess | `deaconess` | 50 | Same as Deacon |
| Secretary | `secretary` | 55 | Records, attendance, events, comms, documents |
| Financial Secretary | `financial_secretary` | 55 | **Finance** RW + export, reports |
| Ministry Leader | `ministry_leader` | 60 | Their ministry: roster, events, attendance, comms |
| Home Cell Leader | `home_cell_leader` | 60 | Their cell: attendance, shepherding, care |
| Media Team | `media_team` | 70 | Documents, communication, events |
| Church Worker | `church_worker` | 80 | Light assist: attendance, member read |
| Member | `member` | 90 | **Self-service** (own data + public) — see §4 |
| Read-only Auditor | `auditor` | 100 | Read-everything (incl. finance/confidential), **zero writes** |

> **Treasurer** is intentionally not a separate seeded role in V1 (the brief's
> latest role list drops it); it's a one-row addition as a finance-scoped role if
> the assembly wants dual finance officers. Noted, not built.

## 3. Default grants (capability grid)

`R` read · `W` write (implies create/update) · `D` delete · `X` export ·
`M` manage · `–` none. Confidential columns shaded 🔒.

### Core & ministry modules

| Module | DP | PE | EL | DC/DCns | SEC | FS | ML | HCL | MED | CW | MEM | AUD |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | R | R | R | R | R | R | R | R | R | R | R | R |
| Membership | RX | RWDX | RW | RW | RWX | R | R | R | R | R | self | R |
| Families | R | RW | RW | R | RW | – | – | R | – | – | self | R |
| Home Cells | R | RW | RW | R | R | – | – | RW | – | – | self | R |
| Ministries | R | RW | RW | – | R | – | RW | – | – | – | self | R |
| Leadership | R | RW | R | – | – | – | – | – | – | – | – | R |
| Visitors | R | RW | RW | RW | RW | – | – | RW | – | – | – | R |
| Attendance | R | RW | RW | RW | RW | – | RW | RW | – | W | self | R |
| Shepherding | RW | RW | RW | RW | – | – | – | RW | – | – | – | R |
| Evangelism | R | RW | RW | – | – | – | – | – | – | – | – | R |
| Events | R | RW | RW | R | RW | – | RW | R | R | R | R | R |
| Prayer | RW | RW | RW | RW | R | – | R | RW | – | R | RW* | R |
| Communication | RW | RW | RW | – | RW | – | RW | – | RW | – | – | R |
| Documents | R | RW | R | R | RW | R | – | RW | RW | – | pub | R |
| Assets | – | RW | – | – | RW | – | – | – | R | – | – | R |
| Reports | RWX | RWX | RX | R | RX | RX | R | R | – | – | – | RX |

### Confidential & admin modules 🔒

| Module | DP | PE | EL | DC/DCns | SEC | FS | ML | HCL | MED | CW | MEM | AUD |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Counselling 🔒 | RW | RW | – | – | – | – | – | – | – | – | – | R |
| Welfare 🔒 | RW | RW | – | RW | – | – | – | – | – | – | – | R |
| Finance 🔒 | RX | RX | – | – | – | RWX | – | – | – | – | own | RX |
| Settings | – | RW | – | – | R | – | – | – | – | – | – | R |
| User Mgmt | – | M | – | – | – | – | – | – | – | – | – | – |
| Role Mgmt | – | – | – | – | – | – | – | – | – | – | – | – |
| Audit | R | R | – | – | – | – | – | – | – | – | – | R |

`*` Member prayer = create/read **own** requests + the public prayer wall.
`own`/`self`/`pub` = row-scoped access, not tenant-wide (see §4). Role Mgmt is
`super_admin`-only by default.

## 4. The Member self-service scope (important RLS nuance)

The Phase-2 *standard* SELECT policy grants any tenant user read of tenant rows —
correct for **staff**, wrong for a **member** (who must see only their own data).
Postgres permissive policies are OR-combined, so we can't "subtract" with another
permissive policy. The fix, applied in
[`91_member_self_scope.sql`](./schema/91_member_self_scope.sql):

- For member-facing tables (`member`, `member_contact`, `family`,
  `contribution`, `prayer_request`, `event_registration`, …) the SELECT policy
  becomes: **`assembly_id = active` AND ( caller holds the broad `*.read`
  permission **OR** the row belongs to the caller's own `member_id` / family /
  cell )**.
- The `member` role holds **none** of the broad `*.read` permissions, so it falls
  through to the self-branch and sees exactly its own record, its family, its
  giving, its prayer requests, plus assembly-public data (events, public docs,
  public prayer wall).
- Staff roles hold the `*.read` permission and see the whole assembly as before.

This keeps one coherent RLS model while making the member portal genuinely safe.

## 5. How the matrix is enforced (recap)

1. **Seed** writes defaults to `role_permission` ([`96_seed_rbac.sql`](./schema/96_seed_rbac.sql)).
2. **RLS** (`auth_has_permission`) reads the matrix live in the DB → the guarantee.
3. **`can()`** reads the same matrix in the app → clean 403s + hidden UI controls.
4. **Admin UI** (`/admin/roles`) edits `role_permission` per assembly → runtime
   reconfiguration, fully audited.
