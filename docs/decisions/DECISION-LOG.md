# Architecture Decision Log (ADRs)

Lightweight ADRs. Each records a decision, the context, the alternatives, and the
consequences. Newest at top. Status: **Accepted** unless noted.

---

## ADR-010 — Confidential domains isolated with permission-gated RLS
**Status:** Accepted (Phase 2)
**Decision:** Counselling, Welfare, and Finance tables use a stricter RLS pattern
requiring an explicit `*.read`/`*.write` permission (not just tenant membership),
plus mandatory `activity_log` triggers on their mutations. `activity_log` has no
update/delete policy → append-only.
**Why:** These records are highly sensitive/audit-critical; base-role tenant
access is not enough.

## ADR-009 — `member` and `app_user` are separate entities (1:0..1)
**Status:** Accepted (Phase 2)
**Decision:** A *person the church ministers to* (`member`) is distinct from a
*login* (`app_user`), linked optionally. Roles are held per-assembly in
`user_assembly_role`.
**Why:** Most members never log in; some staff logins precede a member record.
Cleanly enables the restricted member self-service role (O-2) without conflating
identity with ministry data.

## ADR-008 — Four kickoff defaults locked
**Status:** Accepted (Phase 2)
**Decision:** O-1 Auditor = **Berea-only**; O-2 = **member self-service via a
restricted role** (same app); O-3 Finance = **record-and-reconcile first**
(schema ready for live MoMo webhooks); O-4 Auth = **email/password now, phone+OTP
wired-in for soon**.
**Why:** Each is the lower-risk path and none forecloses the richer option — the
schema (org hierarchy, `momo_transaction`, `app_user`) already accommodates the
upgrades.

## ADR-007 — Baptism, membership status & attendance modelled as records
**Status:** Accepted (Phase 2)
**Decision:** Baptism → `baptism_record` (typed water/holy_spirit), not booleans;
membership status → `membership_status_history` (source of truth) with a cached
`member.current_status`; attendance supports both `attendance_record` (per-person)
and `attendance_count` (aggregate).
**Why:** Richer history, accurate growth/transfer reporting, and real-world
capture for large services. Cached columns keep hot reads fast.

## ADR-006 — Ghana-first integrations behind owned interfaces
**Status:** Accepted (Phase 1)
**Decision:** SMS via Arkesel/Hubtel, finance via Mobile Money (MTN/Telecel/
AirtelTigo), email via Resend — all in V1. WhatsApp and Google Maps are
interface-ready but deferred. Every integration sits behind a port we own with a
per-vendor adapter.
**Why:** Local providers are cheaper/more reliable in Ghana than Twilio/Stripe;
MoMo is how the church actually receives money. Owned interfaces make vendors
swappable and keep domain code vendor-free.
**Consequences:** Slightly more upfront abstraction; big long-term flexibility.

## ADR-005 — Markdown design docs in-repo, phased with approval gates
**Status:** Accepted (Phase 1)
**Decision:** Deliver the 12 planning artifacts as versioned Markdown in `docs/`,
in five phases, each gated on client approval before proceeding.
**Why:** Docs live next to code, are diffable/reviewable, and match a real
software-company workflow. Phasing protects quality ("never rush").

## ADR-004 — Modular monolith, not microservices
**Status:** Accepted (Phase 1)
**Decision:** One Next.js app organized into bounded modules with public
`index.ts` boundaries; async work in Edge Functions + Railway workers.
**Why:** Microservices add distributed-systems cost with no benefit at our scale.
Module boundaries give us most of the isolation benefit and a clean extraction
seam later.
**Consequences:** Discipline required to respect module boundaries (enforced by
convention + lint).

## ADR-003 — Clean layering + repository pattern
**Status:** Accepted (Phase 1)
**Decision:** `components/actions → services → repositories → Supabase`, with
dependencies pointing inward. Repositories are the only layer touching Supabase
and the single place tenant-scoping + soft-delete filters are applied.
**Why:** Testable business logic, one place for cross-cutting data rules, no raw
queries leaking into UI. Supports SOLID/DRY per the brief.

## ADR-002 — Full CoP org hierarchy in the schema from day one
**Status:** Accepted (Phase 1)
**Decision:** Model Region → Area → District → Assembly even though V1 seeds only
Berea. The tenant boundary is the Assembly.
**Why:** CoP's real structure enables district/area roll-ups and future
multi-assembly onboarding without a migration.
**Consequences:** A few extra reference tables now; no painful restructure later.

## ADR-001 — Multi-tenancy via shared DB + Row-Level Security
**Status:** Accepted (Phase 1)
**Decision:** Single PostgreSQL database; every tenant-scoped table carries
`assembly_id`; isolation enforced by Postgres RLS keyed off JWT claims. Defense in
depth via app-layer scoping in repositories.
**Why:** Supabase-native, lowest-cost, scales to hundreds of assemblies, makes
cross-assembly reporting trivial. Isolation enforced at the DB — the most
trustworthy layer.
**Alternatives considered:** schema-per-tenant (migration pain), DB-per-tenant
(ops cost/overkill), single-tenant-refactor-later (rewrite risk).
**Consequences:** RLS policies are critical infrastructure and must be tested
rigorously (dedicated RLS test suite asserting cross-assembly isolation).

---

## Decisions still open (to confirm before / during Phase 2)

- **O-1 Auditor scope:** assembly-only vs. district/area roll-up read.
- **O-2 Member self-service:** restricted role in the same app (recommended) vs.
  separate surface.
- **O-3 MoMo depth in V1:** full aggregator API + webhooks vs. record-and-reconcile.
- **O-4 Phone/OTP auth:** add phone+OTP login for Ghana in V1 or later.
