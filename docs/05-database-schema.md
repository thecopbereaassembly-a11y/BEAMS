# 05 — Database Schema

> **Artifact:** The complete PostgreSQL data model — conventions, the full table
> inventory (domain by domain), enumerated types, and design notes. The concrete
> DDL lives in [`docs/schema/*.sql`](./schema) and will become the
> `supabase/migrations/` set once Phase 2 is approved.
> **Owner:** PostgreSQL Database Architect. **Status:** Phase 2 — in review.

Companion docs: **ERD** → [`06-erd.md`](./06-erd.md) · **RLS/security policies** →
[`docs/schema/90_rls_policies.sql`](./schema/90_rls_policies.sql).

---

## 1. Design principles

1. **Highly normalized (3NF)** with deliberate, documented denormalization only
   for read-heavy aggregates (e.g. cached counts on dashboards, handled by
   materialized views/rollup tables — not by duplicating source-of-truth data).
2. **UUID primary keys** everywhere (`uuid` default `gen_random_uuid()`), so IDs
   are non-guessable and safe to expose, and multi-tenant merges never collide.
3. **Tenant isolation is physical in every row.** Every tenant-scoped table has
   `assembly_id uuid not null references assembly(id)`, and RLS enforces it.
4. **Soft deletes** via `deleted_at`; nothing sensitive is hard-deleted. Views
   and the repository layer filter `deleted_at is null` by default.
5. **Full audit columns** on every domain table (the "audit contract", below).
6. **Referential integrity** enforced by FKs; **data integrity** by CHECK
   constraints and enumerated types; **performance** by deliberate indexes.
7. **Configurable vs. fixed:** things the church must be able to change (roles,
   permissions, categories, statuses that evolve) are **lookup tables**; truly
   stable sets (gender, yes/no-ish states) are **Postgres enums**.
8. **snake_case, singular table names** (`member`, not `members`), `*_id` FKs.

## 2. Extensions

```sql
create extension if not exists "pgcrypto";   -- gen_random_uuid(), crypt()
create extension if not exists "pg_trgm";     -- fuzzy/trigram search (names)
create extension if not exists "unaccent";    -- accent-insensitive search
create extension if not exists "btree_gist";  -- exclusion constraints (scheduling)
create extension if not exists "citext";      -- case-insensitive email/handles
```

## 3. The audit contract (every domain table has these)

```sql
-- Standard trailing columns on every tenant-scoped domain table:
  assembly_id  uuid        not null references assembly(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,                              -- soft delete
  created_by   uuid        references app_user(id),
  updated_by   uuid        references app_user(id)
```

- `updated_at` is maintained by a shared `set_updated_at()` trigger.
- `created_by`/`updated_by` are set by the repository layer from the auth context.
- **Reference/catalog tables** (regions, permissions, service types…) carry
  `created_at/updated_at` but may omit `assembly_id` when global, or carry it when
  church-configurable. This is noted per table.
- **Every sensitive mutation also writes an `activity_log` row** (who/what/when/
  before/after) — that is the tamper-evident trail, separate from the row's own
  audit columns.

## 4. Enumerated types (stable sets)

```sql
create type gender             as enum ('male','female');
create type marital_status     as enum ('single','married','divorced','widowed','separated');
create type member_state       as enum ('visitor','new_convert','member','inactive','transferred_out','deceased');
create type baptism_type       as enum ('water','holy_spirit');
create type attendance_status  as enum ('present','absent','excused','late');
create type session_status     as enum ('scheduled','open','closed','cancelled');
create type followup_status    as enum ('open','in_progress','completed','cancelled');
create type followup_priority  as enum ('low','normal','high','urgent');
create type case_status        as enum ('open','in_progress','on_hold','closed');
create type privacy_level      as enum ('public','leaders_only','private');
create type contribution_channel as enum ('momo','cash','bank','cheque','card','other');
create type momo_network       as enum ('mtn','telecel','airteltigo');
create type txn_status         as enum ('pending','successful','failed','reversed','reconciled');
create type message_channel    as enum ('sms','email','whatsapp','in_app');
create type delivery_status    as enum ('queued','sent','delivered','failed','undelivered');
create type consent_status     as enum ('opted_in','opted_out','unknown');
create type doc_visibility     as enum ('private','leaders','assembly');
create type asset_condition    as enum ('new','good','fair','poor','damaged','disposed');
create type report_format      as enum ('pdf','excel','csv','print');
create type job_status         as enum ('queued','running','succeeded','failed');
```

> Adding an enum value later is a one-line migration. Where the church needs to
> add options at runtime (e.g. counselling categories, funds), we use lookup
> **tables** instead — see each domain.

## 5. Table inventory (domain map — ~110 tables)

Grouped by bounded context. `†` = confidential (extra-restricted RLS + audit).
`◦` = reference/catalog table. Full DDL per group is linked.

### A. Platform, Org Hierarchy & Tenancy — [`10_platform_identity_rbac.sql`](./schema/10_platform_identity_rbac.sql)
`region ◦` · `area ◦` · `district ◦` · `assembly` (**tenant root**) ·
`assembly_setting` · `integration_credential †` · `feature_flag` ·
`numbering_sequence`

### B. Identity, Auth & RBAC — same file
`app_user` · `role ◦` · `permission ◦` · `role_permission` ·
`user_assembly_role` · `invitation` · `user_device` · `auth_event`

### C. Membership — [`20_membership_families.sql`](./schema/20_membership_families.sql)
`member` · `member_contact` · `emergency_contact` · `member_occupation` ·
`member_education` · `skill ◦` · `member_skill` · `member_talent` ·
`membership_status_history` · `baptism_record` · `member_note` · `tag ◦` ·
`member_tag` · `member_document` · `import_batch`

### D. Families — same file
`family` · `family_member`

### E. Home Cells — [`30_groups_ministries_leadership.sql`](./schema/30_groups_ministries_leadership.sql)
`home_cell` · `home_cell_member` · `home_cell_meeting` · `home_cell_report` ·
`home_cell_attendance`

### F. Ministries — same file
`ministry ◦` · `ministry_role ◦` · `ministry_member` · `ministry_meeting` ·
`ministry_attendance` · `ministry_report`

### G. Leadership — same file
`leadership_position ◦` · `leadership_appointment`

### H. Attendance — [`40_attendance_visitors_shepherding.sql`](./schema/40_attendance_visitors_shepherding.sql)
`service_type ◦` · `attendance_session` · `attendance_record` · `attendance_count`

### I. Visitors — same file
`visitor_source ◦` · `visitor` · `visitor_visit`

### J. Shepherding / Follow-up — same file
`followup` · `followup_activity` · `shepherd_assignment`

### K. Counselling † — [`50_care_prayer_evangelism.sql`](./schema/50_care_prayer_evangelism.sql)
`counselling_category ◦` · `counselling_case †` · `counselling_session †` ·
`counselling_note †`

### L. Welfare † — same file
`welfare_category ◦` · `welfare_case †` · `welfare_assessment †` ·
`welfare_disbursement †`

### M. Prayer Requests — same file
`prayer_category ◦` · `prayer_request` · `prayer_update`

### N. Evangelism — same file
`evangelism_program` · `soul_won` · `convert_followup`

### O. Events — [`60_events.sql`](./schema/60_events.sql)
`event_category ◦` · `event` · `event_session` · `event_registration` ·
`event_attendance`

### P. Finance † — [`70_finance.sql`](./schema/70_finance.sql)
`fund ◦` · `account ◦` · `payment_method ◦` · `contribution_type ◦` ·
`contribution †` · `pledge †` · `pledge_payment †` · `expenditure_category ◦` ·
`expenditure †` · `budget` · `budget_line` · `momo_transaction †` ·
`financial_batch` · `receipt`

### Q. Communication & Notifications — [`80_communication_notifications.sql`](./schema/80_communication_notifications.sql)
`message_template ◦` · `audience_segment` · `message_campaign` ·
`message_recipient` · `communication_consent` · `notification` ·
`notification_template ◦` · `notification_delivery` · `notification_preference`

### R. Documents & Assets — [`85_documents_assets.sql`](./schema/85_documents_assets.sql)
`document_folder` · `document` · `document_version` · `document_access` ·
`asset_category ◦` · `asset` · `asset_maintenance` · `asset_assignment`

### S. Reports, System & Audit — [`88_reports_system_audit.sql`](./schema/88_reports_system_audit.sql)
`report_definition ◦` · `saved_report_preset` · `report_schedule` ·
`report_run` · `activity_log` · `webhook_event` · `job_run` · `attachment`

**RLS policies (all domains):** [`90_rls_policies.sql`](./schema/90_rls_policies.sql)
**Triggers, helper functions & seed:** [`95_functions_triggers.sql`](./schema/95_functions_triggers.sql)

> **Count:** ~112 tables across 19 domains — squarely inside your 80–120 target,
> with room for a few link tables to appear during implementation.

## 6. Key modelling decisions (call these out for review)

- **Org hierarchy as real tables** (`region → area → district → assembly`) even
  though V1 has one assembly. Enables roll-ups and future onboarding. (ADR-002)
- **`member` vs `app_user` are separate.** A *member* is a person the church
  ministers to; an *app_user* is a login. They're linked 1:0..1 (`app_user.member_id`).
  Most members have no login; a staff login may exist before a member record.
  This cleanly supports the "restricted member self-service" role (O-2).
- **Baptism as records, not booleans.** `baptism_record` with `baptism_type`
  ('water'|'holy_spirit') captures date, officiant, location, and evidence —
  richer and more audit-friendly than two flags on `member`.
- **Membership status as history**, not just a column. `member.current_status`
  is a cached convenience; `membership_status_history` is the source of truth
  (supports transfers, reactivations, and accurate growth reporting).
- **Attendance supports both roster and headcount.** `attendance_record`
  (per-person) *and* `attendance_count` (aggregate counts for large services
  where per-person is impractical) — real churches need both.
- **Finance is MoMo-first but channel-agnostic.** `contribution.channel` +
  optional `momo_transaction` link. Record-and-reconcile now (O-3); live webhook
  ingestion drops into `momo_transaction`/`webhook_event` later with no reshape.
- **Confidential domains** (counselling, welfare, finance) are isolated tables
  with their own RLS predicate requiring an explicit permission, plus mandatory
  `activity_log` on every read *and* write for counselling/welfare.
- **Follow-ups are polymorphic-by-reason, not by loose FK.** `followup` links to
  a `subject_member_id` and carries a `reason` + optional typed source refs
  (`visitor_id`, `attendance_session_id`) — avoiding a fragile generic FK while
  still unifying the pastoral-care queue.
- **Idempotency built in.** `webhook_event` and `momo_transaction` carry unique
  provider references so retried SMS/MoMo webhooks can't double-post.

## 7. Indexing strategy (summary)

- Every FK column is indexed.
- Partial indexes exclude soft-deleted rows: `where deleted_at is null`.
- Tenant-scoped hot paths use **composite** indexes leading with `assembly_id`
  (e.g. `(assembly_id, current_status) where deleted_at is null`).
- Full-text/fuzzy search on names/notes via `pg_trgm` GIN indexes.
- Time-series reads (attendance, contributions) indexed on `(assembly_id, <date>)`.
- Exclusion constraints (`btree_gist`) prevent overlapping event/room bookings.

Per-table indexes are defined inline in each `docs/schema/*.sql` file.
