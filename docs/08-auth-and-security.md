# 08 — Authentication, Sessions & Security

> **Artifact:** How users prove who they are, how tenant + role context flows into
> every request, and the concrete security controls. **Owner:** Security Engineer
> + Backend lead. **Status:** Phase 3 — in review.

---

## 1. Authentication (who you are)

Supabase Auth (GoTrue) is the identity provider.

- **V1:** email + password, with secure password reset (magic-link style token).
- **Wired-in for soon (ADR-008):** phone number + SMS OTP — natural for Ghana and
  already accommodated (`app_user.phone`, SMS integration). It's a config +
  provider switch, not a schema change.
- **Never:** we store no passwords ourselves; GoTrue handles hashing (bcrypt),
  reset tokens, and email verification.

### The `member` ↔ `app_user` ↔ `auth.users` chain
```
auth.users (Supabase)  ──1:1──  app_user (our profile + flags)  ──0..1──  member
```
A login is provisioned by **invitation** (staff) or **member self-service
activation** (a member claims their record). Signup is *not* open to the public.

## 2. The tenant + role context (the heart of authorization)

A user may belong to several assemblies over time, but acts within **one active
assembly** at a time. That context must reach the database for RLS to work.

### Custom Access Token Hook (stamps the JWT)
On login and on **assembly switch**, a Supabase **Auth Hook** injects claims into
the JWT's `app_metadata`:

```jsonc
"app_metadata": {
  "assembly_id":    "…",            // active assembly (drives RLS + repo scoping)
  "assembly_ids":   ["…","…"],       // all assemblies the user may switch to
  "role_keys":      ["presiding_elder"],
  "is_super_admin": false,
  "member_id":      "…"             // if linked, for self-service scoping
}
```

- RLS helpers (`auth_assembly_id()`, `auth_has_permission()` — see
  [`90_rls_policies.sql`](./schema/90_rls_policies.sql)) read these claims.
  **Permissions are resolved live from the DB matrix**, not baked into the JWT, so
  a permission change takes effect on the next request — no re-login needed.
- **Switching assembly** = re-mint the token with a new `assembly_id` (a
  `switchAssembly` action). Nothing else in the app changes; all queries re-scope
  automatically because RLS keys off the claim.

## 3. Session management

- **Storage:** tokens in **http-only, secure, SameSite cookies** set by the
  Next.js server — never in `localStorage` (XSS-safe). The browser Supabase client
  is bound to these via the server.
- **Access token** short-lived (≈1h); **refresh token** rotated on use; refresh
  reuse detection revokes the family (Supabase built-in).
- **Idle & absolute timeouts:** configurable per assembly
  (`assembly_setting.session`), enforced server-side.
- **Device/session visibility:** `user_device` + `auth_event` power a "signed-in
  devices" screen and a "sign out everywhere" action.
- **Sensitive-action step-up (roadmap):** re-auth prompt before high-risk finance
  actions; the hook exists in the flow now.

## 4. Authorization (what you may do) — RBAC + permission matrix

Two enforcement layers, both required:

1. **Database (RLS)** — the guarantee. Tenant isolation + permission-gated
   confidential tables, off JWT claims. Covered in Phase 2.
2. **Application (`can()`)** — the ergonomics + defense in depth. A shared
   `can(user, 'finance.write')` guard in `shared/rbac/` used in server actions
   (to return a clean `403`) and in the UI (to hide/disable controls).

```ts
// shared/rbac/can.ts — resolves the SAME matrix RLS uses
can(ctx, 'counselling.read')   // boolean
requirePermission(ctx, 'finance.write')  // throws Forbidden → 403 envelope
```

The role×permission catalog and defaults are in
[09 — Permission Matrix](./09-permission-matrix.md) and seeded by
[`96_seed_rbac.sql`](./schema/96_seed_rbac.sql). Because grants live in
`role_permission` (with per-assembly overrides), **an admin can reconfigure any
role's permissions at runtime** — your explicit requirement — with no deploy.

## 5. Secrets & sensitive data

- **Integration credentials** (SMS/MoMo/email API keys) are stored **encrypted**
  in `integration_credential.secret_ciphertext` (pgcrypto), decrypted only
  server-side by the service role. Never sent to the browser.
- **Service-role key** lives only in server env (`lib/supabase/admin.ts`, guarded
  by `import "server-only"`); it can never enter a client bundle.
- **PII minimization:** national ID / Ghana Card and similar are access-restricted
  fields; counselling/welfare bodies are confidential tables. Storage buckets are
  **private by default**; files served via short-lived **signed URLs**.
- **Encryption:** at rest (Supabase-managed Postgres + Storage), in transit (TLS
  everywhere).

## 6. Password & account policy

- Minimum length + breach-check (reject known-compromised), rate-limited attempts,
  lockout with backoff, mandatory reset on invitation acceptance.
- Email verification for staff logins; admins can force-reset and
  suspend/reactivate (`app_user.is_active`, `user_assembly_role.is_active`).
- All auth events (`login`, `login_failed`, `password_reset`, `role_granted`)
  recorded in `auth_event` / `activity_log` for security review.

## 7. Hardening checklist (baked into the app shell)

- **Input validation** at every boundary with Zod (never trust the client).
- **CSRF:** Server Actions are origin-checked; state-changing Route Handlers
  verify origin + use the auth cookie.
- **Security headers / CSP** via Next middleware (strict CSP, HSTS,
  `X-Content-Type-Options`, frame-ancestors none).
- **Rate limiting** on auth + mutation + webhook surfaces (see
  [07 — API Design §7](./07-api-design.md)).
- **Audit everything sensitive** — append-only `activity_log`, immutable to
  clients (no update/delete RLS policy). Auditor role is read-only system-wide.
- **RLS test suite** (non-negotiable): asserts assembly A can never read/write
  assembly B's rows under *any* role, and that confidential tables reject callers
  lacking the explicit permission.
- **Dependency & secret scanning** in CI; least-privilege service accounts.

## 8. Data protection & compliance (Ghana Data Protection Act, Act 843)

- **Consent:** `communication_consent` per member per channel; opt-out honored
  before any SMS/email send.
- **Subject access & rectification:** a member's full record is exportable; edits
  are audited.
- **Minimization & retention:** we collect what ministry needs; retention rules
  per entity (e.g. counselling records) configurable; soft-delete + purge policy.
- **Breach readiness:** audit trail + backups (Phase 5) support incident response.

## 9. Threat model (top risks & mitigations)

| Threat | Mitigation |
|---|---|
| Cross-tenant data leak | RLS `force` on every table + app scoping + RLS test suite |
| Privilege escalation | Permission matrix resolved server-side; role changes audited |
| Leaked service-role key | `server-only` guard; never bundled; rotate-able |
| Webhook spoofing (fake MoMo credit) | Signature verification + idempotency + reconciliation |
| Session theft (XSS) | http-only cookies, strict CSP, no token in JS-readable storage |
| Confidential record snooping | Explicit-permission RLS + mandatory read/write audit on counselling/welfare |
| Brute-force login | Rate limiting, lockout, breach-checked passwords |
