# 07 — API Design

> **Artifact:** How the frontend talks to the backend — the API surface, its
> conventions, error model, validation boundary, pagination, and the endpoint
> catalog per module. **Owner:** Backend lead + Principal Architect.
> **Status:** Phase 3 — in review.

---

## 1. API philosophy: **Server Actions first, Route Handlers where they earn it**

Next.js 15 gives us two server entry points. We use each for what it's best at.

| Use **Server Actions** for… | Use **Route Handlers** (`app/api/*`) for… |
|---|---|
| Form submissions & mutations from the app (create member, mark attendance, record contribution) | **Webhooks** (SMS/MoMo status callbacks) — external callers |
| Anything invoked by our own React UI | **File exports** (PDF/Excel/CSV streamed downloads) |
| Optimistic-update flows via TanStack Query | **Cron/worker triggers** hit by Railway |
| | **Public/unauthenticated** endpoints (invitation accept) |
| | Anything a **third party or non-browser client** calls |

**Why this split:** Server Actions remove a whole layer of hand-written API
boilerplate for the 90% case (our own UI), while keeping the server as the trust
boundary. Route Handlers remain for the 10% that needs a stable URL, streaming,
or an external caller. This is the modern Next.js idiom, not a compromise.

Every server action and route handler is a **thin controller**: authenticate →
validate (Zod) → authorize (permission check) → delegate to a module **service**
→ shape the response. No business logic lives at this layer.

## 2. The request lifecycle (every mutation goes through this)

```
Client (RHF + Zod)                Server Action / Route Handler
      │ typed input                        │
      ▼                                     ▼
 optimistic update            1. getSession()        → 401 if none
      │                       2. Zod.parse(input)    → 422 on invalid
      │                       3. can(user, 'perm')   → 403 if denied
      │                       4. service.method()    → business rules
      │                       5. repository (scoped)  → DB (RLS enforced)
      │                       6. logActivity()        → audit (sensitive ops)
      ▼                                     │
 cache invalidation  ◄───────────  typed Result<T> / ActionResult
```

**Validation happens twice, deliberately:** client (fast UX) and server (trust).
Both import the **same Zod schema** from the module's `schemas/`, so they can't
drift. The server never trusts client-validated data.

## 3. Standard response envelope

Server Actions return a discriminated union; Route Handlers return the same shape
as JSON. No throwing across the boundary for *expected* failures.

```ts
type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ApiError }

interface ApiError {
  code: ErrorCode          // 'unauthorized' | 'forbidden' | 'validation' |
                           // 'not_found' | 'conflict' | 'rate_limited' |
                           // 'integration_error' | 'internal'
  message: string          // safe, user-facing (localized)
  fieldErrors?: Record<string, string[]>   // for form validation
  requestId: string        // correlates with server logs & activity_log
}
```

HTTP status mapping for Route Handlers: `401` unauthorized · `403` forbidden ·
`404` not_found · `409` conflict · `422` validation · `429` rate_limited ·
`5xx` internal. **Server errors are never leaked verbatim** to the client;
the `requestId` ties the friendly message to full server-side detail.

## 4. Conventions

- **Naming (actions):** `verbNoun` — `createMember`, `markAttendance`,
  `recordContribution`, `assignShepherd`, `sendCampaign`.
- **Naming (REST routes):** resource-oriented, plural — `GET /api/reports/attendance/export`.
- **Pagination:** cursor-based for large/append-only lists (attendance,
  contributions, activity log); offset+limit acceptable for small admin lists.
  Standard params: `?cursor=&limit=&sort=&order=&q=&filter[...]`.
- **Filtering & search:** a shared `ListQuery` Zod schema (`q`, `filters`, `sort`,
  `pagination`) reused by every list endpoint → uniform hooks & UI.
- **Idempotency:** mutations that can be retried (offline attendance, MoMo
  webhook, campaign send) accept an `Idempotency-Key` / `client_uuid`; the server
  upserts so retries are safe.
- **Timezone/locale:** all timestamps `timestamptz` (UTC) over the wire; rendered
  in `Africa/Accra`. Money always carries an explicit currency (`GHS`).
- **Soft delete:** `DELETE` sets `deleted_at`; a `restore` action clears it.
  Lists exclude soft-deleted rows unless `?includeDeleted=true` (with permission).

## 5. Endpoint / action catalog (representative — full list generated per module)

Each module exposes a consistent set. Example for **Membership**:

```
# Server Actions (from the app UI)
createMember(input)            → member.write
updateMember(id, input)        → member.write
softDeleteMember(id)           → member.delete
restoreMember(id)              → member.delete
addMemberContact(memberId, …)  → member.write
recordBaptism(memberId, …)     → member.write
changeMembershipStatus(id, …)  → member.write
assignToHomeCell(id, cellId)   → member.write + homecell.write
importMembers(batch)           → member.write (bulk)

# Route Handlers (URLs)
GET  /api/members?q&cursor&limit&filter        → member.read   (list, cursor)
GET  /api/members/:id                          → member.read
GET  /api/members/:id/timeline                 → member.read   (activity feed)
GET  /api/reports/membership/export?format     → member.export (PDF/Excel/CSV)
```

The same shape repeats for every module. Key cross-module endpoints:

| Area | Endpoint / Action | Permission |
|---|---|---|
| **Attendance** | `createSession`, `markAttendance` (bulk, offline-safe), `setHeadcount` | `attendance.write` |
| **Shepherding** | `assignShepherd`, `logFollowupActivity`, `closeFollowup`; `GET /api/shepherding/queue` | `shepherding.write/read` |
| **Finance** | `recordContribution`, `postBatch`, `recordExpenditure`, `issueReceipt` | `finance.write` |
| **Communication** | `sendCampaign`, `previewSegment`, `GET /api/communication/:id/status` | `communication.write` |
| **Reports** | `runReport`, `scheduleReport`; `GET /api/reports/:type/export?format=` | `report.read/write` |
| **Webhooks** | `POST /api/webhooks/sms/:provider`, `POST /api/webhooks/momo/:network` | signature-verified, no session |
| **Admin** | `inviteUser`, `assignRole`, `updateRolePermissions`, `switchAssembly` | `user.manage`, `role.manage` |
| **AI (stub)** | `POST /api/assistant/query` → returns typed report/query result | `assistant.use` (flagged off in V1) |

## 6. Webhooks (external → us) — the untrusted edge

- **Signature verification first.** Every provider webhook is HMAC/secret-verified
  before we touch the body. Unverified → `401`, logged to `auth_event`.
- **Idempotent ingestion.** Body lands in `webhook_event` keyed by
  `(provider, external_id)` — a unique constraint drops duplicate retries. Only
  then is it processed (update `message_recipient` delivery status, or upsert a
  `momo_transaction`).
- **Fast ack, async process.** Respond `200` immediately after persisting the raw
  event; a worker processes it. Never make a provider wait on our business logic.

## 7. Rate limiting & abuse protection

- Auth endpoints (login, forgot-password, invitation-accept): strict IP + account
  limits with backoff.
- Mutation actions: per-user token bucket; bulk sends (SMS) additionally gated by
  a cost/volume ceiling from `assembly_setting`.
- Webhooks: per-provider IP allowlist + signature (rate limiting is secondary).
- Implemented as a shared middleware/util so every entry point is covered
  uniformly. (Detailed in [08 — Auth & Security](./08-auth-and-security.md).)

## 8. Versioning & stability

- Route Handlers live under `/api/` and are considered a **stable contract**;
  breaking changes go to `/api/v2/...`. Server Actions are internal (co-deployed
  with the UI) and evolve freely.
- The **AI Assistant** deliberately consumes the *same* typed report/query
  services the REST layer uses — so wiring an LLM later adds a caller, not a new
  data path. (Future-ready per the brief.)

## 9. Generated types & client

- Supabase generates DB types (`database.types.ts`); Zod schemas infer input/output
  types. TanStack Query hooks in each module (`use-members`, `use-member`) wrap
  the actions/endpoints with a shared **query-key factory** for predictable cache
  invalidation.
- A thin typed `apiClient` wraps `fetch` for Route Handlers (auth headers, error
  envelope parsing, `requestId` propagation).
