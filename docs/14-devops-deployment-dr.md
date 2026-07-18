# 14 — DevOps, Deployment & Disaster Recovery

> **Artifact:** How BEAMS is built, shipped, observed, backed up, and recovered.
> **Owner:** DevOps Engineer + Principal Architect. **Status:** Phase 5 — in review.

---

## 1. Hosting topology

```
                ┌────────────────────────── Users (Ghana, mobile-first) ─────────┐
                │                        HTTPS / PWA                              │
                ▼                                                                 │
        ┌───────────────┐        ┌──────────────────────────┐     ┌──────────────┐
        │ Vercel (Edge  │  RLS   │ Supabase project         │     │ Railway      │
        │ + Node)       │◄──────►│ · Postgres 15 (+PITR)    │     │ · Cron/worker│
        │ Next.js 15    │        │ · Auth (GoTrue)          │◄───►│ · SMS/MoMo   │
        │ RSC + Actions │        │ · Storage (private)      │     │   webhook    │
        │ Route Handlers│        │ · Edge Functions (Deno)  │     │   processors │
        └───────────────┘        └──────────────────────────┘     └──────────────┘
                │                          │                              │
                └── observability ─────────┴──────────────────────────────┘
                    (Sentry · Vercel Analytics · Supabase logs · uptime)
```

- **Vercel** — the Next.js app (SSR/RSC/Server Actions/Route Handlers), global CDN,
  preview deploy per PR.
- **Supabase** — managed Postgres (with Point-in-Time Recovery), Auth, Storage,
  Edge Functions. The system of record.
- **Railway** — long-running/scheduled work that shouldn't sit in serverless:
  nightly sweeps (absentees, birthdays), scheduled reports, SMS/MoMo webhook
  processors, backup exports.

**Why this split:** Vercel is perfect for the app; Supabase gives us Postgres+RLS
as a platform; Railway covers durable cron/workers that serverless functions
handle poorly. Each does what it's best at, matching the Phase-2/3 architecture.

## 2. Environments

| Env | Branch | Web | Database | Data |
|---|---|---|---|---|
| **Local** | any | `next dev` | Supabase CLI (Docker) | seeded fixtures |
| **Preview** | every PR | Vercel preview | Supabase branch DB | anonymized seed |
| **Staging** | `main` | Vercel (staging alias) | Supabase staging project | realistic anonymized |
| **Production** | `release` tag | Vercel prod | Supabase prod project | Berea live data |

- **Config over code:** all env-specific values via environment variables (schema
  below); no secrets in the repo. `.env.example` documents every key.
- **Preview DBs** use Supabase branching so a PR gets an isolated database with
  migrations + seed applied — real RLS, real Postgres, throwaway.

## 3. CI/CD pipeline (GitHub Actions → Vercel/Supabase)

```mermaid
flowchart LR
  PR[Pull request] --> L[Lint + typecheck (strict TS)]
  L --> U[Unit tests (Vitest)]
  U --> M[Apply migrations to ephemeral DB]
  M --> RLS[RLS isolation test suite]
  RLS --> I[Integration tests (repos vs Supabase)]
  I --> E[Playwright e2e on preview]
  E --> A[a11y + contrast + Lighthouse budget]
  A --> PV[Vercel preview deploy]
  PV --> RV{Review + approve}
  RV -->|merge main| ST[Deploy staging + migrate]
  ST -->|tag release| PRD[Deploy prod + migrate (gated)]
```

**Gates that block a merge:** strict-TS typecheck, lint, unit + integration +
**RLS isolation** tests, e2e on critical flows, accessibility/contrast checks, and
the performance budget. Nothing reaches `main` red.

- **Production deploys are gated** (manual approval on the `release` tag) and
  run **migrations first, then app** with a health check + automatic rollback on
  failure.

## 4. Database migration workflow (the discipline)

- **Migrations are the source of truth** (`supabase/migrations/*.sql`), authored
  from the Phase-2 schema files. Never edit prod schema by hand.
- **Forward-only, additive-first.** Expand → migrate data → contract (two-phase)
  for breaking changes, so deploys are zero-downtime and rollback-safe.
- **Every migration is tested** in CI against an ephemeral DB *and* re-runs the
  RLS suite (a policy change can't silently break isolation).
- **Seeds** (`96_seed_rbac.sql`, org/reference seed) are idempotent and versioned.
- **Type generation** (`supabase gen types`) runs in CI; drift between DB and TS
  types fails the build.

## 5. Secrets & environment variables

```
# Public (browser-safe)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL
# Server-only (NEVER shipped to client)
SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
CREDENTIAL_ENCRYPTION_KEY          # pgcrypto secret wrapping
ARKESEL_API_KEY / HUBTEL_*         # SMS
MOMO_* (per network/aggregator)    # Mobile Money
RESEND_API_KEY                     # Email
SENTRY_DSN, CRON_SECRET
```

- Stored in Vercel/Railway/Supabase secret stores + GitHub Actions secrets — never
  in the repo. Integration provider keys *also* live encrypted in
  `integration_credential` for per-assembly configuration.
- Rotation runbook documented; service-role key is highest-sensitivity.

## 6. Observability & monitoring

- **Errors:** Sentry (web + workers), releases tagged, `requestId` from the API
  envelope correlates client error → server log → `activity_log`.
- **Performance:** Vercel Analytics / Web Vitals against the budget (P75 < 2.5s).
- **Database:** Supabase logs + slow-query insights; alert on connection saturation.
- **Uptime:** external monitor on `/api/health` (checks app + DB + auth).
- **Delivery:** SMS/MoMo/email delivery dashboards from `message_recipient` /
  `webhook_event`; alert on failure-rate spikes and SMS cost ceilings.
- **Jobs:** every cron/worker writes `job_run`; alert on failed/overdue jobs.

## 7. Scaling path (designed-in, not premature)

- **Now:** single Supabase project, connection pooling (Supabase pooler/PgBouncer),
  indexes from Phase 2, RSC caching + CDN. Comfortable for Berea and many
  assemblies.
- **Later, if load demands** (multi-assembly growth): read replicas for reporting,
  materialized views for heavy dashboards, table partitioning on the big
  time-series tables (`attendance_record`, `contribution`, `activity_log`) by
  `assembly_id`/date, and extracting a worker or two — all *incremental*, no
  rewrite (that's the modular-monolith payoff, ADR-004).

## 8. Backup & Disaster Recovery

| Control | Policy |
|---|---|
| **Automated backups** | Supabase daily backups + **Point-in-Time Recovery** (prod). |
| **Independent export** | Nightly Railway job dumps an encrypted logical backup to separate object storage (defense against provider-side loss/account issues). |
| **Storage** | Bucket versioning; documents/photos included in the export routine. |
| **RPO (data loss target)** | ≤ 5 min (PITR). |
| **RTO (recovery time target)** | ≤ 2 hours to restore prod from PITR/backup. |
| **Retention** | Daily 30 days · weekly 12 weeks · monthly 12 months (configurable). |
| **Restore drills** | Quarterly test-restore into a scratch project — a backup is only real if restore is rehearsed. |

**DR runbook (summary):** detect → declare → restore latest good PITR to a new
project → re-point Vercel/Railway env → verify (health check, RLS suite smoke,
spot-check finance/attendance) → communicate. Full step list in
[15 — Implementation Roadmap §Runbooks](./15-implementation-roadmap.md).

## 9. Data protection operations (Act 843)

- Encrypted backups; access-logged restores; retention honored on backups too.
- Member data export & erasure procedures (subject rights) are supported
  operationally, not just in-app.

## 10. Cost posture (budget-conscious, as flagged)

- Start on Supabase/Vercel low tiers + one small Railway service — modest monthly
  cost for a single assembly.
- **Variable costs are visible and capped:** SMS is per-message (cost logged per
  campaign, ceiling in `assembly_setting`); MoMo is per-transaction. Admins see
  spend before sending.
- Scaling costs are incremental and tied to real assembly growth, not paid upfront.
