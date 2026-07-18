# 03 — Project & Folder Structure

> **Artifact:** Repository layout, module organization, and the conventions that
> keep a 24-module system maintainable.
> **Owner:** Principal Architect + Frontend/Backend leads. **Status:** Phase 1 — in review.

---

## 1. Repository strategy

A **single application repository** (not a multi-package monorepo yet). At V1
scale, one well-structured Next.js app with internal module boundaries is simpler
to build, test, and deploy than a Turborepo of packages. We keep the *seams*
(shared `packages/`-style folders inside `src/`) so that extracting packages
later is mechanical, not a rewrite.

```
beams/
├── docs/                      # design artifacts (this folder)
├── supabase/                  # database as code
│   ├── migrations/            # timestamped SQL migrations (source of truth)
│   ├── functions/             # Edge Functions (Deno)
│   ├── seed/                  # seed data (roles, permissions, Berea assembly)
│   └── config.toml
├── public/                    # static assets, PWA manifest, icons
├── src/
│   ├── app/                   # Next.js App Router (routes only — thin)
│   ├── modules/               # ⭐ the 24 bounded modules (business logic)
│   ├── components/            # shared, cross-module UI
│   ├── lib/                   # framework/infra glue (supabase, auth, utils)
│   ├── server/                # server-only: repositories, services base, jobs
│   ├── shared/                # cross-cutting: types, schemas, constants, rbac
│   ├── hooks/                 # shared React hooks
│   ├── styles/                # Tailwind base, tokens, themes
│   └── config/                # env, feature flags, locale (Ghana defaults)
├── tests/                     # e2e (Playwright) + integration
├── scripts/                   # dev/ops scripts (typegen, seed, backup)
├── .env.example
└── package.json
```

## 2. The `app/` directory (routing only — kept thin)

Routes are **thin**: they compose module components and call module services.
No business logic lives in `app/`.

```
src/app/
├── (marketing)/                 # public: sign-in landing (minimal)
├── (auth)/
│   ├── login/
│   ├── forgot-password/
│   └── set-password/
├── (app)/                       # authenticated shell (sidebar, top bar, cmd-k)
│   ├── layout.tsx               # app shell: nav, breadcrumbs, command palette
│   ├── dashboard/
│   ├── members/
│   │   ├── page.tsx             # list (server component)
│   │   ├── new/
│   │   └── [memberId]/          # profile → tabs (overview, family, attendance…)
│   ├── families/
│   ├── home-cells/
│   ├── ministries/
│   ├── leadership/
│   ├── visitors/
│   ├── attendance/
│   ├── shepherding/
│   ├── counselling/             # extra-restricted route group
│   ├── welfare/                 # extra-restricted route group
│   ├── evangelism/
│   ├── events/
│   ├── finance/                 # extra-restricted route group
│   ├── prayer-requests/
│   ├── communication/
│   ├── documents/
│   ├── assets/
│   ├── reports/
│   ├── notifications/
│   ├── activity-logs/
│   ├── settings/
│   └── admin/
│       ├── users/               # User Management
│       ├── roles/               # RBAC / permission matrix editor
│       └── assembly/            # assembly & org settings
├── api/                         # Route Handlers: webhooks, exports, RPC
│   ├── webhooks/{sms,momo}/
│   └── reports/[type]/export/
├── manifest.ts                  # PWA manifest
└── globals: layout.tsx, error.tsx, not-found.tsx, loading.tsx
```

## 3. The `modules/` directory (where the system actually lives)

**Every module is self-contained and follows the same internal shape.** This is
the single most important convention in the codebase: once you know one module,
you know all 24. Modules talk to each other only through their public
`index.ts` — never by reaching into another module's internals.

```
src/modules/<module>/            # e.g. membership, attendance, finance
├── components/                  # UI specific to this module
│   ├── member-table.tsx
│   ├── member-form.tsx
│   └── member-profile/…
├── hooks/                       # module React hooks (wrap TanStack Query)
│   ├── use-members.ts
│   └── use-member.ts
├── services/                    # business rules (framework-agnostic)
│   └── membership.service.ts
├── repositories/                # data access (Supabase, assembly-scoped)
│   └── member.repository.ts
├── schemas/                     # Zod schemas (shared client+server)
│   └── member.schema.ts
├── actions/                     # Next.js server actions (thin controllers)
│   └── member.actions.ts
├── types.ts                     # module-local types (derived from Zod/DB)
├── permissions.ts               # this module's permission keys
└── index.ts                     # ⭐ the ONLY public surface of the module
```

### Layering rule (Clean Architecture, enforced by convention + lint)

```
components / actions  →  services  →  repositories  →  Supabase
     (UI / entry)        (rules)       (data access)     (DB)
```

- **Dependencies point inward.** `services` never import React or Next; they can
  be unit-tested in isolation. `repositories` are the only layer that touches
  Supabase. `components`/`actions` orchestrate but hold no business rules.
- **Repository pattern** wraps Supabase so business logic never sees raw queries,
  and so tenant scoping (`assembly_id`) + soft-delete filters are applied in one
  place per entity.

## 4. Shared & cross-cutting code

```
src/shared/
├── rbac/                    # roles, permissions, permission-matrix resolver
│   ├── roles.ts
│   ├── permissions.ts       # canonical permission catalog
│   └── can.ts               # can(user, 'finance.write') → boolean
├── schemas/                 # cross-module Zod (pagination, audit, address…)
├── types/                   # database.types.ts (generated), api result types
├── constants/               # enums mirrored from DB (membership status, etc.)
├── errors/                  # typed AppError hierarchy + Result<T,E>
└── audit/                   # audit-log helpers used by every service

src/lib/
├── supabase/
│   ├── client.ts            # browser client (anon key, RLS-bound)
│   ├── server.ts            # server client (cookies, RLS-bound)
│   └── admin.ts             # service-role client (server-only, never bundled)
├── auth/                    # session, JWT claim helpers, guards
├── query/                   # TanStack Query client + key factory
├── offline/                 # IndexedDB write-queue + sync engine
├── integrations/            # ports & adapters: sms/, momo/, email/
├── format/                  # GHS, +233 phone, dates (Africa/Accra)
└── utils/
```

## 5. Naming & code conventions

- **Files:** `kebab-case.ts` / `kebab-case.tsx`. **React components:** `PascalCase`.
  **Hooks:** `useThing`. **Server actions:** `verbNoun` (e.g. `createMember`).
- **DB:** `snake_case`, singular table names (`member`, not `members`), `*_id`
  foreign keys, `is_*`/`has_*` booleans.
- **Imports:** absolute via `@/…`; a module may import from another module **only**
  through `@/modules/<other>` (its `index.ts`), never a deep path.
- **Server-only guard:** files in `lib/supabase/admin.ts` and `server/` carry
  `import "server-only"` so the service role can never leak into a client bundle.
- **Result over throw** for expected domain failures: services return
  `Result<T, AppError>`; only truly exceptional cases throw.

## 6. Testing layout

- **Unit** — services & pure logic (Vitest), co-located as `*.test.ts`.
- **Integration** — repositories against a local Supabase + RLS (verifies tenant
  isolation for real).
- **E2E** — critical flows in Playwright (`tests/e2e`): login, mark attendance
  offline→sync, create member, record MoMo offering, generate report.
- **RLS tests** — a dedicated suite that asserts assembly A cannot read/write
  assembly B under any role. Non-negotiable.

## 7. Why this structure scales to hundreds of churches

- **Uniform modules** mean a new engineer is productive in any module on day one.
- **Public `index.ts` boundaries** keep coupling low, so modules evolve
  independently and could be extracted to packages/services later.
- **One place per concern** (tenant scoping, audit, validation, integrations)
  means a policy change (e.g. a new audit field, a new SMS vendor) is one edit,
  not 24.
