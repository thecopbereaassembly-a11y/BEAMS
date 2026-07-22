# 16 — Launch Readiness

> **Artifact:** What is done, what must happen before Berea's real data goes in,
> and the honest list of what is deferred. **Owner:** Principal Architect + DevOps.
> **Status:** M10 — living document.

---

## 1. What is built and verified

All ten implementation milestones are complete. Each was verified against the
**live Supabase database**, not just unit-tested.

| Milestone | Delivered | Live checks |
|---|---|---|
| M0 | Foundation: 115 tables, RLS, auth, RBAC, app shell | schema + claims verified |
| M1 | Membership | 14/14 |
| M2 | Home Cells · Ministries · Leadership | 17/17 |
| M3 | Attendance (offline-first) | 19/19 |
| M4 | Dashboard & Reports (CSV/Excel/print) | 12/12 |
| M5 | Visitors · Shepherding · Prayer · Counselling🔒 · Welfare🔒 | 20/20 |
| M6 | Events & Communication (SMS/email) | 17/17 |
| M7 | Finance🔒 (MoMo-first) | 19/19 |
| M8 | Documents · Assets · Evangelism · Notifications · Activity Logs | build + typecheck |
| M9 | Member self-service | 12/12 |

**Security properties proven, not assumed:**
- **Tenant isolation** — zero cross-assembly rows on every table tested.
- **Confidential gating** — a `secretary` gets 0 rows from counselling, welfare,
  contributions, receipts and the MoMo ledger, and `42501` on writes.
- **Member self-scope** — a `member` sees exactly their own record; another
  member's GHS 999 gift is invisible; they cannot modify anyone else's row.
- **Audit trail** — every money and confidential mutation is written by database
  triggers, not application code, and `activity_log` has no update/delete path.
- **Idempotent offline sync** — replaying queued attendance never duplicates.
- **Atomic receipt numbers** — 5 concurrent allocations produced 5 distinct numbers.

## 2. Hardening applied (M10)

- **Content-Security-Policy** with `frame-ancestors 'none'`, plus `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in
  production. Applied to every response in middleware.
- **Rate limiting** on login, exports and webhooks (sliding window).
- **Error boundary** that never shows a stack trace — a plain message and a
  reference digest for support.
- **Health endpoint** that actually queries the database and returns **503** when
  it cannot, so monitoring alerts rather than reporting false green.

## 3. ⚠️ Before real member data goes in

These are **not optional**. Ordered by importance.

1. **Change the administrator password.** The current one was set during
   development and appears in a chat transcript. Change it, and consider
   rotating the Supabase service-role key.
2. **Correct the reference data.** Ministries, service days/times and funds were
   seeded with *my assumptions*, not Berea's reality. Verify: does Berea have
   PENSA? Is midweek service really Wednesday? Which funds do you actually
   collect toward?
3. **Decide dev vs production.** This Supabase project has been used for
   development throughout. The recommendation stands: create a **separate
   production project**, apply the same migrations (`npm run db:migrate:seed`),
   and keep this one for testing.
4. **Test on a real phone.** Especially the offline attendance flow — the sync
   contract is verified at the data layer, but the IndexedDB queue has not been
   driven in a browser with the network toggled off.
5. **Walk through as each role.** Create a test user per role (Secretary,
   Financial Secretary, Home Cell Leader) and confirm each sees a sensible app.
6. **Enable backups you can restore.** Supabase PITR is on for paid plans;
   confirm it, then **do a test restore**. A backup nobody has restored is a
   hope, not a backup.

## 4. Known limitations (deliberate, documented)

| Limitation | Why | When it matters |
|---|---|---|
| **Rate limiting is per-instance** | In-memory; state is not shared across serverless instances, so the effective limit is limit × instances | Move to Postgres/Upstash before public exposure |
| **PDF is browser-print** | Avoids a fragile headless-browser pipeline; output matches the screen exactly | Only if you need *scheduled* PDFs emailed automatically |
| **MoMo is record-and-reconcile** | Chosen in O-3; schema and `momo_transaction` are ready for live webhooks | When you want members paying in-app |
| **SMS/email simulate without credentials** | Dry-run adapter labels sends "simulated" rather than faking delivery | Add `ARKESEL_API_KEY` to go live |
| **No automated e2e browser tests** | Verification was done against the live database instead | Worth adding Playwright before multi-assembly rollout |
| **AI Assistant not built** | Deliberately deferred; the typed report/query layer it needs exists | Post-V1 |

## 5. Deploy runbook

```bash
# 1. Create the production Supabase project, then:
cp .env.example .env.production.local     # fill in prod values
npm run db:migrate:seed                    # apply all migrations + seed
npm run db:types                           # regenerate types from prod schema

# 2. Enable the auth hook (dashboard, one-time):
#    Authentication → Hooks → Customize Access Token (JWT) Claims
#    → public.custom_access_token_hook

# 3. Create the first administrator:
node --env-file=.env.production.local scripts/bootstrap-admin.mjs \
  --email admin@yourdomain --password '<chosen>' --name "Name" --super

# 4. Verify the whole chain before announcing:
node --env-file=.env.production.local scripts/verify-auth.mjs --email … --password …

# 5. Deploy to Vercel with the same env vars, then check:
curl https://<domain>/api/health     # expect 200 and "database": { ok: true }
```

## 6. Operating it

| Task | Command |
|---|---|
| Apply new migrations | `npm run db:migrate` |
| Check migration status | `npm run db:status` |
| Regenerate DB types | `npm run db:types` |
| Inspect seeded reference data | `npm run db:inspect` |
| Add a user | `scripts/bootstrap-admin.mjs --role <key>` |
| Remove a user completely | `scripts/remove-user.mjs --email <email>` |
| Re-verify any milestone | `scripts/verify-m<N>.mjs --email … --password …` |

The `verify-m*.mjs` scripts are **regression tests against production-shaped
data** — they create fixtures, assert, and clean up after themselves. Run them
after any significant change.

## 7. Where the design lives

Docs 01–15 remain the authoritative record of *why* the system is shaped this
way. If a future decision contradicts one, add an ADR to
[`decisions/DECISION-LOG.md`](./decisions/DECISION-LOG.md) rather than editing
history — the log is the reasoning trail.
