# 04 — Feature Breakdown

> **Artifact:** Every module decomposed into capabilities, key entities, and the
> roles that use it. This is the bridge from the brief to the data model (Phase 2)
> and API (Phase 3).
> **Owner:** Product Manager + Solutions Architect. **Status:** Phase 1 — in review.

Legend for roles: **SA** Super Admin · **DP** District Pastor · **PE** Presiding
Elder · **EL** Elder · **DC** Deacon/Deaconess · **SEC** Secretary · **FS/TR**
Financial Sec/Treasurer · **HCL** Home Cell Leader · **ML** Ministry Leader ·
**MED** Media · **CW** Church Worker · **MEM** Member · **AUD** Auditor.

---

## Tier 1 — Core

### 1. Dashboard
Role-aware landing page; each persona sees the widgets that matter to them.
- **Widgets:** attendance trend, membership growth, birthdays this week/month,
  anniversaries, new visitors, pending follow-ups, upcoming events, open prayer
  requests, active welfare cases, home-cell report status, ministry report
  status, quick actions, recent activity, notifications.
- **Entities:** aggregates only (reads from every module).
- **Roles:** all (content filtered by permissions & scope).

### 2. Membership
The heart of the system; everything links to a member.
- **Capabilities:** create/edit/soft-delete member; rich profile (personal info,
  photo, occupation, education, skills, talents, professional background,
  emergency contacts); baptism status (water + Holy Ghost); membership-status
  lifecycle; assign to family, home cell, ministries; full profile tabs
  (overview, family, attendance, counselling, welfare, prayer, documents,
  activity timeline, audit, notes); global search; bulk import; transfers.
- **Entities:** `member`, `member_contact`, `member_skill`, `member_education`,
  `member_occupation`, `emergency_contact`, `baptism_record`, `membership_status_history`,
  `member_note`, `member_document`, `member_tag`.
- **Roles:** create/edit → SEC, PE, EL, DC; read → most; sensitive fields gated.

### 3. Families
Model households and relationships.
- **Capabilities:** create family unit; add members with relationship
  (head, spouse, child, dependant); household address; family view; family
  attendance & giving roll-ups (giving visible only to finance roles).
- **Entities:** `family`, `family_member` (member↔family + relationship + role).
- **Roles:** SEC, PE, EL create/edit; read broad.

### 4. Home Cells
The primary unit of shepherding and weekly attendance (CoP Bacenta-style).
- **Capabilities:** create cells; assign leader & members; meeting schedule &
  location (optional map); weekly cell attendance; weekly cell report
  (attendance, offering, testimonies, absentees, follow-ups); cell health
  metrics; multiplication/split tracking.
- **Entities:** `home_cell`, `home_cell_member`, `home_cell_meeting`,
  `home_cell_report`, `home_cell_attendance`.
- **Roles:** HCL owns their cell; PE/EL oversee all; SEC assists.

### 8. Attendance *(core — grouped with Tier 1)*
- **Capabilities:** define service types (Sunday, midweek, prayer, special);
  create attendance sessions; capture attendance (check-in list, quick counts,
  offline-first); visitor attendance; per-member attendance history; absentee
  detection ("absent N weeks") feeding Shepherding.
- **Entities:** `service_type`, `attendance_session`, `attendance_record`,
  `attendance_count` (aggregate for headcount-only services).
- **Roles:** SEC, HCL, ML capture; all read (scoped).

### 19. Reports
- **Capabilities:** parameterized report builder for attendance, visitors, new
  converts, home cells, ministries, birthdays, anniversaries, baptisms,
  transfers, member growth, finance, pastoral care, welfare, prayer, events;
  scheduled reports; export **PDF / Excel / CSV / print**; saved report presets.
- **Entities:** `report_definition`, `report_run`, `report_schedule`.
- **Roles:** scoped by module permissions; AUD read-only.

### 20. Settings
- Assembly profile & org hierarchy; service types; membership statuses &
  lifecycle; ministries catalog; tags; locale (GHS, +233, Africa/Accra); theme;
  notification preferences; integration credentials (SMS/MoMo/email, encrypted).
- **Roles:** SA, PE.

### 21. User Management
- Invite users; link a user to a member; assign roles; **configurable permission
  matrix** per role; activate/suspend; reset password; session/device view.
- **Entities:** `app_user`, `user_assembly_role`, `role`, `permission`,
  `role_permission`.
- **Roles:** SA, PE.

### 22. Notifications
- In-app notification center + delivery via SMS/email; templates; per-user
  preferences; digest vs. immediate; delivery status.
- **Entities:** `notification`, `notification_template`, `notification_delivery`,
  `notification_preference`.
- **Roles:** all receive; SA/PE/SEC configure & send.

### 23. Activity Logs
- Append-only audit trail: actor, action, entity, before/after, IP, timestamp;
  filter & search; export.
- **Entities:** `activity_log`.
- **Roles:** SA, PE, AUD read; system writes.

---

## Tier 2 — Ministry & Care

### 5. Ministries
- CoP ministries/movements (PEMEM, PEWOMOM, Youth, PENSA, Children, Evangelism)
  + custom; membership rosters; leaders; meetings/attendance; ministry reports.
- **Entities:** `ministry`, `ministry_member`, `ministry_role`, `ministry_meeting`,
  `ministry_report`.
- **Roles:** ML owns; PE/EL oversee.

### 6. Leadership
- Officer directory & ranks (Presiding Elder, Elders, Deacons/Deaconesses,
  appointed officers); appointments with start/end; portfolios; ordination dates.
- **Entities:** `leadership_position`, `leadership_appointment`.
- **Roles:** SA, PE, DP.

### 7. Visitors
- Capture first-time & repeat visitors; source/how-they-heard; assign follow-up;
  visitor-to-member conversion; visitor pipeline board.
- **Entities:** `visitor`, `visitor_visit`, `visitor_followup` (→ Shepherding).
- **Roles:** SEC, HCL, EL, DC.

### 9. Shepherding
- Follow-up engine: auto-generate follow-ups from absenteeism, new visitors, new
  converts; assign shepherds; contact log; status (open/in-progress/closed);
  pastoral care queue on the dashboard.
- **Entities:** `followup`, `followup_activity`, `shepherd_assignment`.
- **Roles:** DP, PE, EL, DC, HCL.

### 10. Counselling *(confidential)*
- Confidential case management: sessions, notes, category, status, assigned
  counsellor; strict access (explicit `counselling.*` permission); redacted from
  general views; extra audit.
- **Entities:** `counselling_case`, `counselling_session`, `counselling_note`.
- **Roles:** DP, PE, and explicitly authorized counsellors only.

### 11. Welfare *(confidential)*
- Welfare/benevolence cases: request, assessment, approvals, disbursement
  (linked to Finance), status; confidential; audited.
- **Entities:** `welfare_case`, `welfare_assessment`, `welfare_disbursement`.
- **Roles:** DP, PE, DC (welfare), FS/TR for disbursement.

### 13. Events
- Church calendar; event CRUD; registration/RSVP; event attendance; reminders
  (SMS/email); recurring events; ministry/home-cell events.
- **Entities:** `event`, `event_session`, `event_registration`, `event_attendance`.
- **Roles:** SEC, ML, PE create; all view.

### 15. Prayer Requests
- Submit (member or on-behalf); privacy level (public/leaders-only/private);
  prayer wall; assign to prayer team; mark answered; testimonies.
- **Entities:** `prayer_request`, `prayer_update`.
- **Roles:** all submit; prayer team & leaders manage.

### 16. Communication
- Compose & send SMS/email to segments (all members, a home cell, a ministry,
  absentees, birthdays); templates; scheduling; delivery reports; cost tracking;
  opt-out/consent management.
- **Entities:** `message_campaign`, `message_recipient`, `message_template`,
  `communication_consent`.
- **Roles:** SA, PE, SEC, ML (scoped to their group).

---

## Tier 3 — Extended

### 14. Finance *(confidential, audit-critical — Mobile-Money-first)*
- **Contributions:** tithes, offerings, pledges, welfare, project funds; **Mobile
  Money-first** (MTN/Telecel/AirtelTigo) plus cash & bank; per-member giving
  history (privacy-gated); pledges & fulfilment.
- **Accounting:** funds/accounts, income & expenditure, categories, budgets,
  approvals; disbursements (incl. welfare); receipts (email/SMS).
- **Reconciliation:** MoMo transaction matching, idempotent webhook ingestion.
- **Reports:** giving statements, income/expenditure, fund balances, remittances.
- **Entities:** `fund`, `account`, `contribution`, `contribution_type`,
  `pledge`, `pledge_payment`, `expenditure`, `expenditure_category`,
  `momo_transaction`, `financial_batch`, `receipt`, `budget`.
- **Roles:** FS/TR, PE; AUD read-only; strict audit on all mutations.

### 12. Evangelism
- Outreach programs, souls won / new converts, convert follow-up pipeline
  (→ Shepherding & Membership), campaign reporting.
- **Entities:** `evangelism_program`, `soul_won`, `convert_followup`.
- **Roles:** ML (evangelism), EL, DC.

### 17. Documents
- Central document library (constitution, minutes, policies, member docs);
  folders, versioning, access control, signed-URL downloads; link docs to
  members/events/ministries.
- **Entities:** `document`, `document_version`, `document_access`.
- **Roles:** SA, PE, SEC manage; access scoped.

### 18. Assets
- Church asset/inventory register: category, location, condition, value,
  acquisition, maintenance log, custodian, depreciation (optional).
- **Entities:** `asset`, `asset_category`, `asset_maintenance`, `asset_assignment`.
- **Roles:** SA, PE, SEC, custodians.

---

## Future-ready (designed, not built in V1)

### 24. AI Assistant
- Natural-language queries over church data ("members absent 4 weeks", "birthdays
  this month", "generate this month's pastoral report", "inactive youth",
  "who needs follow-up?").
- **V1 provisioning:** a stable, typed query/report service layer + a stubbed
  `assistant` interface and audit of AI actions, so wiring an LLM later is
  additive. **No LLM is connected in V1.**

### WhatsApp · Google Maps
- Interfaces defined in the integration layer (`SmsProvider`-style ports);
  adapters deferred.

---

## Cross-module capabilities (built once, used everywhere)

- **Global search & command palette (⌘K):** jump to any member, cell, ministry,
  event, or action.
- **Soft delete + restore:** every domain entity; deleted rows hidden by default,
  restorable by authorized roles.
- **Audit everything:** create/update/delete on sensitive entities → `activity_log`.
- **Tagging:** flexible tags across members, events, etc.
- **Bulk operations:** import members, bulk SMS, bulk assign to cell/ministry.
- **Export:** PDF/Excel/CSV/print available anywhere a list or report exists.
- **Notifications & follow-ups:** any module can raise a follow-up or notification
  through shared services.

> **Next:** Phase 2 turns every entity named above into a concrete, normalized,
> RLS-protected PostgreSQL schema (targeting the 80–120 table range) with an ERD.
