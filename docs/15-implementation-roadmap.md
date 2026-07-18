# 15 — Implementation Roadmap

> **Artifact:** How we go from approved blueprint to shipped software — build
> sequence, milestones, definition of done, testing strategy, and runbooks.
> **Owner:** Product + Principal Architect. **Status:** Phase 5 — in review.

---

## 1. Build sequence (thin vertical slices, not horizontal layers)

We build **end-to-end vertical slices** (DB → RLS → service → API → UI → tests),
not "all the backend, then all the frontend." Each milestone ships something a
real user can use. Order follows the Tier-1→3 value plan from
[01 — Vision & Scope](./01-vision-and-scope.md).

| # | Milestone | Delivers (working software) | Depends on |
|--:|---|---|---|
| **M0** | **Foundation** | Repo scaffold, CI/CD, Supabase project, **all migrations + RLS applied & verified**, RBAC seed, Berea tenant seeded, auth + app shell + design system | — |
| **M1** | **Membership core** | Members (CRUD, profile tabs, search, import), Families, baptism/status records | M0 |
| **M2** | **Groups** | Home Cells (+ weekly report), Ministries, Leadership | M1 |
| **M3** | **Attendance** | Service types, sessions, **offline capture + sync**, headcount, history | M1 |
| **M4** | **Dashboard v1 + Reports v1** | Role-aware dashboard, attendance/membership/growth reports, PDF/Excel/CSV export | M1–M3 |
| **M5** | **Care & pastoral** | Visitors, Shepherding (absentee sweeps → queue), Prayer, Counselling🔒, Welfare🔒 | M1–M3 |
| **M6** | **Events & Communication** | Events + registration, SMS/Email campaigns (Arkesel/Hubtel/Resend), consent | M1 |
| **M7** | **Finance🔒** | Contributions (MoMo-first), batches, expenditure, pledges, receipts, finance reports | M1, M4 |
| **M8** | **Extended** | Documents, Assets, Evangelism, Notifications center, Activity Logs UI | M1 |
| **M9** | **Member self-service** | Restricted member role portal (own profile, giving, prayer, RSVP) | M1, M7 |
| **M10** | **Hardening & launch** | Full a11y/perf pass, security review, DR drill, data migration, training, go-live | all |
| **Post-V1** | AI Assistant, phone/OTP, WhatsApp, live MoMo webhooks, multi-assembly onboarding | — |

Each milestone is independently demoable and shippable to Berea for feedback.

## 2. Definition of Done (every slice must pass)

- [ ] Strict TypeScript, lint clean; follows the module structure ([03](./03-project-and-folder-structure.md)).
- [ ] Zod schema shared client/server; validation on both sides.
- [ ] RLS policies present **and** covered by the isolation test suite.
- [ ] Permissions wired (RLS + `can()` + UI gating) per [09](./09-permission-matrix.md).
- [ ] Audit entries on sensitive mutations.
- [ ] Unit (services) + integration (repos vs Supabase) + e2e (critical path) tests.
- [ ] Loading skeletons, empty states, error states, optimistic UX.
- [ ] Accessible (keyboard, labels, AA contrast) in light + dark.
- [ ] Works on a 360px mobile viewport; offline behavior where applicable.
- [ ] Docs updated (module README + any ADR).

## 3. Testing strategy (the pyramid)

- **Unit (many):** pure service/business logic — Vitest, fast, isolated.
- **Integration (focused):** repositories against a real local Supabase — proves
  queries, constraints, and **tenant scoping** work for real.
- **RLS suite (non-negotiable):** asserts assembly A can never read/write assembly
  B under any role, and confidential tables reject callers without the explicit
  permission. Runs on every PR.
- **E2E (critical flows only):** login + assembly switch, create member, offline
  attendance → sync, record contribution, run/export a report, configure a role.
- **Accessibility & performance:** automated axe + contrast + Lighthouse budget in CI.

## 4. First sprint (M0) — concrete checklist

1. Scaffold Next.js 15 + TS strict + Tailwind + shadcn; commit design tokens.
2. Supabase project (local + staging + prod); wire env + secret stores.
3. Convert `docs/schema/*.sql` → `supabase/migrations/` **in order**; apply.
4. **Verify the schema for real:** load into local Supabase, confirm every FK,
   index, enum, trigger, and RLS policy compiles; run RBAC seed; run the first
   cross-tenant RLS tests. *(This is the "not yet run against Postgres" caveat
   from Phases 2–3, retired.)*
5. Auth (email/password) + custom access-token hook (claims) + assembly context.
6. App shell: sidebar/topbar/breadcrumbs/command palette + theme + a11y baseline.
7. CI/CD pipeline green end-to-end; preview deploys working.
8. Seed Berea org hierarchy (Greater Accra → Dansoman Area → Sahara District →
   Berea English Assembly) + standard CoP leadership positions & ministries.

## 5. Runbooks (operational)

- **Release:** merge → staging auto-deploy + migrate → smoke → tag `release` →
  gated prod deploy (migrate-then-app) → health check → announce; auto-rollback on
  failure.
- **Disaster recovery:** detect → declare → restore latest good PITR to a fresh
  project → re-point Vercel/Railway env → verify (health, RLS smoke, spot-check
  finance + attendance) → communicate. RPO ≤ 5 min, RTO ≤ 2 h.
- **Secret rotation:** rotate provider/API keys + service-role key on schedule and
  on incident; update secret stores + `integration_credential`; verify integrations.
- **Onboarding a new assembly (post-V1):** create assembly row + settings + seed
  reference data + invite admin; RLS makes it isolated by construction.
- **Incident (data/security):** contain → assess via `activity_log`/`auth_event` →
  notify per Act 843 → remediate → post-mortem.

## 6. Handover & training (usability-first)

- In-app onboarding + contextual help for low-computer-experience officers.
- Short role-based guides (Secretary, Home Cell Leader, Financial Secretary).
- Technical docs (this `docs/` set) kept current as the living design record.

---

## 7. Design track complete — what's approved becomes the contract

With Phases 1–5 approved, the blueprint is complete:

| Phase | Artifacts | Docs |
|---|---|---|
| 1 | Vision, architecture, structure, features | 01–04 |
| 2 | Schema (114 tables), ERD, RLS | 05–06, `schema/` |
| 3 | API, auth/security, permission matrix | 07–09, seed |
| 4 | Design system, wireframes, components, flows/state | 10–13 |
| 5 | DevOps, deployment, DR, roadmap | 14–15 |

**Next action = M0.** On your go, we scaffold the repo and, first thing, retire
the one honest caveat carried through Phases 2–3 by running the schema + RLS +
seed against a live Postgres and proving tenant isolation.
