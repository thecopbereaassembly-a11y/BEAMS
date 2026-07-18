# 02 — System Architecture

> **Artifact:** High-level system architecture, tenancy model, security model,
> integration architecture, and technology rationale.
> **Owner:** Principal Architect + Solutions Architect. **Status:** Phase 1 — in review.

---

## 1. Architectural style: **Modular Monolith on a serverless backend**

We deliberately choose a **modular monolith**, not microservices.

- One Next.js application, internally organized into **bounded modules**
  (membership, attendance, finance, …) with clear interfaces between them.
- One PostgreSQL database (Supabase) with strict schemas and RLS.
- Background/async work runs as **Supabase Edge Functions** and **Railway
  workers** (cron, SMS/MoMo webhooks, report generation).

**Why not microservices?** At Berea's scale (and even at hundreds of assemblies
on a shared multi-tenant DB), microservices add distributed-systems cost —
network hops, eventual consistency, ops overhead — with no benefit. A modular
monolith gives us SOLID module boundaries *today* and leaves a clean seam to
extract a service later **if and only if** load demands it. This is the same
call Planning Center and Shopify-scale teams make for years.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Client (Browser / PWA)                        │
│  Next.js 15 App Router · React 19 · shadcn/ui · TanStack Query         │
│  Offline queue (IndexedDB) · Service Worker · Command Palette          │
└───────────────┬───────────────────────────────────┬───────────────────┘
                │ RSC / Server Actions               │ Supabase JS (RLS)
                ▼                                     ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│  Next.js Server (Vercel)      │      │        Supabase Platform         │
│  · Server Components/Actions  │      │  · PostgreSQL 15 + RLS           │
│  · Route Handlers (REST/RPC)  │◄────►│  · Auth (JWT, GoTrue)            │
│  · Domain services (modules)  │      │  · Storage (photos, docs)        │
│  · Zod validation boundary    │      │  · Edge Functions (Deno)         │
│  · Repository layer           │      │  · Realtime (optional)           │
└───────────────┬───────────────┘      └───────────────┬──────────────────┘
                │                                       │
                ▼                                       ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│   Railway Workers / Cron      │      │      External Integrations       │
│  · Scheduled reports          │      │  · Arkesel / Hubtel  (SMS)       │
│  · Absentee/birthday sweeps   │      │  · MTN/Telecel/AirtelTigo (MoMo) │
│  · SMS/MoMo webhook handlers  │      │  · Resend            (Email)     │
│  · Nightly backups/exports    │      │  · WhatsApp / Google Maps (later)│
└───────────────────────────────┘      └──────────────────────────────────┘
```

## 2. Multi-tenancy: **Shared database + Row-Level Security**

**Decision (ADR-001):** a single PostgreSQL database. Every tenant-scoped table
carries a non-null `assembly_id`. Isolation is enforced in the database by
**Postgres Row-Level Security**, keyed off the authenticated user's JWT claims —
*not* by trusting application code.

Why this is the right call for us:

- **Supabase-native.** RLS + JWT is exactly how Supabase is designed to enforce
  multi-tenant access. We get isolation at the lowest, most trustworthy layer.
- **Cost & ops.** One DB, one migration stream, one backup. Scales to hundreds
  of assemblies without per-tenant provisioning.
- **Cross-assembly reporting** (district/area roll-ups) is a simple query, not a
  fan-out across databases.

### The tenancy contract (every engineer must internalize this)

1. Every domain table has `assembly_id uuid not null references assembly(id)`.
2. A user's memberships/roles live in `user_assembly_role`, and their **active
   assembly + role set** is stamped into the JWT (`app_metadata`) at login and
   on assembly switch.
3. RLS policies compare `assembly_id` against a claim helper, e.g.
   `assembly_id = (auth.jwt() -> 'app_metadata' ->> 'assembly_id')::uuid`, plus
   permission checks for writes.
4. The **service role** (server-only, never shipped to the browser) bypasses RLS
   for trusted server operations (migrations, cron, webhooks) and re-applies
   tenant scoping in code.
5. **Defense in depth:** the repository layer *also* filters by `assembly_id`.
   RLS is the guarantee; app-layer scoping is the seatbelt.

> Full policies, helper functions, and the tenant-switch flow are specified in
> Phase 2 (schema) and Phase 3 (auth).

## 3. Security model (summary — detailed in Phase 3)

- **AuthN:** Supabase Auth (email/password + magic link; phone/OTP is a natural
  fit for Ghana and is on the roadmap). JWT access tokens, rotating refresh
  tokens, secure http-only cookie storage on the server.
- **AuthZ:** **RBAC with a permission matrix.** Roles (Super Admin → Member →
  Auditor) map to granular permissions (`member.read`, `finance.write`,
  `counselling.read`, …). Permissions are **configurable per role** (your
  requirement) and resolved at request time. Sensitive modules (counselling,
  welfare, finance) require explicit permissions beyond the base role.
- **Audit:** an append-only `activity_log` records who/what/when/before/after on
  every sensitive mutation. Auditor role is read-only across the system.
- **Data protection:** encryption at rest (Supabase/Postgres), TLS in transit,
  Storage buckets private-by-default with signed URLs, PII minimization, and
  retention rules aligned to Ghana's Data Protection Act (Act 843).
- **Hardening:** rate limiting on auth and public endpoints, strong password
  policy, session management/idle timeout, CSRF-safe server actions, input
  validation at every boundary with Zod.

## 4. Data & validation flow (the "one true path")

```
UI form ──(React Hook Form + Zod schema)──► Server Action / Route Handler
      ▲                                          │
      │                                          ▼
 optimistic UI  ◄──(TanStack Query cache)  Zod re-validation (never trust client)
                                                 │
                                                 ▼
                                        Domain service (business rules)
                                                 │
                                                 ▼
                                     Repository (typed, assembly-scoped)
                                                 │
                                                 ▼
                                   Supabase / Postgres (RLS enforced)
```

- **Single source of truth for shapes:** Zod schemas live in a shared package and
  are used on **both** client and server. Types are inferred from Zod (`z.infer`)
  and from generated Supabase types — no hand-maintained duplicate types.
- **Validation happens twice on purpose:** client (fast UX) and server (trust
  boundary). They share the *same* schema, so they never drift.

## 5. Offline strategy (PWA)

Attendance capture and member lookup are the offline-critical flows.

- Installable PWA with a service worker; app shell + reference data (member list,
  home cells) cached.
- **Write queue in IndexedDB:** offline mutations (mark attendance, add note) are
  queued with a client-generated UUID and idempotency key, then flushed on
  reconnect. Server upserts are idempotent to make retries safe.
- Clear connectivity + sync status in the UI so a Home Cell Leader always knows
  whether their attendance has been saved.

## 6. Integration architecture (Ghana-first)

| Concern | Provider (V1) | Pattern |
|--------|----------------|---------|
| **SMS** | Arkesel / Hubtel | Provider-agnostic `SmsProvider` interface; adapter per vendor; delivery-status webhooks; per-message cost logged. |
| **Mobile Money** | MTN MoMo, Telecel Cash, AirtelTigo Money | `PaymentProvider` interface; record + reconcile; webhook-driven status; every txn has an idempotency key and audit entry. |
| **Email** | Resend | `EmailProvider` interface; templated receipts/reports. |
| **WhatsApp / Maps** | Deferred | Interfaces defined now, adapters stubbed. |

**Principle:** every external integration sits behind an **interface we own** (a
port), with a vendor-specific **adapter**. Swapping Arkesel↔Hubtel, or adding a
second MoMo aggregator, is an adapter change — no domain code touches a vendor
SDK directly. This is the Ports & Adapters (hexagonal) discipline applied
pragmatically.

## 7. Environments

| Env | Web | DB | Purpose |
|-----|-----|----|---------|
| **Local** | Next dev | Supabase local (Docker) | Development against a real Postgres + RLS. |
| **Preview** | Vercel preview per PR | Supabase branch DB | Ephemeral, per-pull-request review. |
| **Staging** | Vercel | Supabase staging project | Pre-prod, seeded with realistic data. |
| **Production** | Vercel | Supabase prod project | Berea live data. |

## 8. Key technology rationale (why each piece earns its place)

- **Next.js 15 App Router + Server Actions** — server-first rendering keeps the
  app fast on mid-range Android; Server Actions collapse a lot of boilerplate API
  code while keeping the server as the trust boundary.
- **Supabase** — gives us managed Postgres, Auth, Storage, and Edge Functions in
  one platform with **RLS as a first-class citizen**, which is exactly what our
  multi-tenant model needs.
- **TanStack Query** — server-state caching, background refetch, optimistic
  updates, and offline-friendly retries — the backbone of a snappy, resilient UI.
- **Zod + React Hook Form** — one schema, validated on both sides; great DX,
  no type drift.
- **shadcn/ui + Tailwind + Framer Motion** — accessible, unstyled-by-default
  primitives we fully own (copied into the repo, not a black-box dependency),
  themed for light/dark, with tasteful motion.
- **Recharts** — declarative charts for dashboards/reports without heavy config.

## 9. Cross-cutting concerns (owned centrally, used everywhere)

Logging & observability · error handling & typed results · i18n/locale (Ghana
defaults) · feature flags (for tiered rollout & future modules) · caching &
revalidation strategy · rate limiting · audit logging · background jobs. Each is
a shared module every feature depends on, so behavior is consistent and testable.

---

### Open architecture questions to confirm before Phase 2

1. **Auditor read scope** — assembly-only, or district/area roll-up read access?
2. **Member self-service portal** — same app with a restricted role (recommended),
   or a separate lightweight surface later?
3. **MoMo integration depth in V1** — full aggregator API + webhooks, or
   *record-and-reconcile* (manual entry now, automated later)? This changes
   Finance's Phase-2 tables and Phase-3 webhooks.
