# 06 — Entity Relationship Diagram

> **Artifact:** The data model as diagrams. One big ERD of ~112 tables is
> unreadable, so this is split into a **context map** plus per-domain ERDs.
> Cardinality: `||--o{` = one-to-many, `}o--o{` = many-to-many (via link table),
> `||--o|` = one-to-zero/one. Full column detail is in [`docs/schema/`](./schema).
> **Owner:** Database Architect. **Status:** Phase 2 — in review.

---

## 1. Context map — how the domains connect

```mermaid
graph TD
    subgraph Platform
      ORG[Region → Area → District → Assembly]
      RBAC[Roles · Permissions · Users]
    end
    MEM[Membership & Families]
    GRP[Home Cells · Ministries · Leadership]
    ATT[Attendance · Visitors]
    SHEP[Shepherding / Follow-up]
    CARE[Counselling · Welfare]
    PRAY[Prayer]
    EVAN[Evangelism]
    EVT[Events]
    FIN[Finance]
    COMM[Communication · Notifications]
    DOC[Documents · Assets]
    RPT[Reports]
    SYS[Audit · System]

    ORG --> MEM
    RBAC --> MEM
    MEM --> GRP
    MEM --> ATT
    ATT --> SHEP
    ATT -->|attendance & offering| FIN
    MEM --> CARE
    MEM --> PRAY
    EVAN --> MEM
    MEM --> EVT
    MEM --> FIN
    CARE -->|disbursement| FIN
    MEM --> COMM
    MEM --> DOC
    ALL[All modules] --> RPT
    ALL --> SYS
```

**Reading it:** every domain hangs off `Assembly` (the tenant) and `member`.
Attendance feeds both Shepherding (absentees → follow-ups) and Finance (service
offerings). Welfare disbursements post into Finance. Everything writes to Audit.

---

## 2. Platform, Identity & RBAC

```mermaid
erDiagram
    region ||--o{ area : has
    area ||--o{ district : has
    district ||--o{ assembly : has
    assembly ||--o{ assembly_setting : configures
    assembly ||--o{ user_assembly_role : scopes
    app_user ||--o{ user_assembly_role : holds
    role ||--o{ user_assembly_role : assigned_as
    role ||--o{ role_permission : grants
    permission ||--o{ role_permission : granted_in
    assembly ||--o{ role_permission : overrides
    app_user ||--o| member : "is (optional)"
    assembly ||--o{ invitation : issues
    app_user ||--o{ user_device : uses
    app_user ||--o{ auth_event : generates
```

The **configurable permission matrix** is `role_permission` (role × permission,
with an optional per-assembly override row). `user_assembly_role` is what stamps
the JWT and drives RLS.

---

## 3. Membership & Families

```mermaid
erDiagram
    assembly ||--o{ member : contains
    member ||--o{ member_contact : has
    member ||--o{ emergency_contact : has
    member ||--o{ member_occupation : has
    member ||--o{ member_education : has
    member ||--o{ member_skill : has
    skill ||--o{ member_skill : referenced_by
    member ||--o{ member_talent : has
    member ||--o{ baptism_record : "water + holy_spirit"
    member ||--o{ membership_status_history : tracked_by
    member ||--o{ member_note : annotated_by
    member ||--o{ member_tag : tagged
    tag ||--o{ member_tag : used_in
    member ||--o{ member_document : owns
    family ||--o{ family_member : groups
    member ||--o{ family_member : belongs_to
    family ||--o| member : "headed_by"
```

Note `member` and `app_user` are **separate** (a person vs. a login), linked
1:0..1 — the backbone of the restricted member self-service role.

---

## 4. Home Cells, Ministries & Leadership

```mermaid
erDiagram
    assembly ||--o{ home_cell : has
    home_cell ||--o{ home_cell_member : rosters
    member ||--o{ home_cell_member : joins
    home_cell ||--o{ home_cell_meeting : holds
    home_cell_meeting ||--o{ home_cell_attendance : records
    home_cell ||--o{ home_cell_report : reports
    home_cell ||--o| home_cell : "multiplied_from"

    assembly ||--o{ ministry : has
    ministry ||--o{ ministry_role : defines
    ministry ||--o{ ministry_member : rosters
    member ||--o{ ministry_member : joins
    ministry ||--o{ ministry_meeting : holds
    ministry_meeting ||--o{ ministry_attendance : records
    ministry ||--o{ ministry_report : reports

    leadership_position ||--o{ leadership_appointment : filled_by
    member ||--o{ leadership_appointment : appointed_as
```

---

## 5. Attendance, Visitors & Shepherding

```mermaid
erDiagram
    service_type ||--o{ attendance_session : schedules
    attendance_session ||--o{ attendance_record : "per-person"
    attendance_session ||--o{ attendance_count : "aggregate headcount"
    member ||--o{ attendance_record : marked_in
    visitor ||--o{ attendance_record : marked_in

    visitor_source ||--o{ visitor : categorizes
    visitor ||--o{ visitor_visit : logs
    member ||--o| visitor : "converts_to"

    member ||--o{ followup : "subject (member)"
    visitor ||--o{ followup : "subject (visitor)"
    attendance_session ||--o{ followup : "source (absentee)"
    followup ||--o{ shepherd_assignment : assigned_to
    followup ||--o{ followup_activity : contacted_via
    member ||--o{ shepherd_assignment : shepherds
```

The **pastoral-care queue** on the dashboard is a query over `followup` (open,
by priority). Absentee sweeps and new visitors auto-create follow-ups.

---

## 6. Counselling, Welfare, Prayer & Evangelism

```mermaid
erDiagram
    counselling_category ||--o{ counselling_case : categorizes
    member ||--o{ counselling_case : subject_of
    counselling_case ||--o{ counselling_session : has
    counselling_session ||--o{ counselling_note : records

    welfare_category ||--o{ welfare_case : categorizes
    member ||--o{ welfare_case : subject_of
    welfare_case ||--o{ welfare_assessment : assessed_by
    welfare_case ||--o{ welfare_disbursement : pays_out
    expenditure ||--o| welfare_disbursement : "posts_as"

    prayer_category ||--o{ prayer_request : categorizes
    member ||--o{ prayer_request : submits
    prayer_request ||--o{ prayer_update : updated_by

    evangelism_program ||--o{ soul_won : yields
    soul_won ||--o{ convert_followup : followed_up
    followup ||--o| convert_followup : "via"
    member ||--o| soul_won : "converts_to"
```

Counselling & Welfare are **confidential** (shaded by RLS): explicit permission
required to even read.

---

## 7. Events

```mermaid
erDiagram
    event_category ||--o{ event : categorizes
    assembly ||--o{ event : hosts
    ministry ||--o| event : "may_own"
    home_cell ||--o| event : "may_own"
    event ||--o{ event_session : occurs_as
    event ||--o{ event_registration : takes
    member ||--o{ event_registration : registers
    event ||--o{ event_attendance : records
    event_registration ||--o| event_attendance : "checked_in_as"
```

---

## 8. Finance

```mermaid
erDiagram
    fund ||--o{ contribution : designates
    account ||--o{ contribution : deposits_to
    contribution_type ||--o{ contribution : classifies
    financial_batch ||--o{ contribution : groups
    member ||--o{ contribution : gives
    payment_method ||--o{ contribution : paid_by
    momo_transaction ||--o| contribution : "reconciles_to"
    attendance_session ||--o| financial_batch : "offering_of"

    member ||--o{ pledge : pledges
    fund ||--o{ pledge : toward
    pledge ||--o{ pledge_payment : paid_by
    contribution ||--o| pledge_payment : "recorded_as"

    expenditure_category ||--o{ expenditure : classifies
    fund ||--o{ expenditure : from
    account ||--o{ expenditure : paid_from
    budget ||--o{ budget_line : contains
    contribution ||--o| receipt : issues
    member ||--o{ receipt : receives
```

**MoMo-first, channel-agnostic:** `contribution.channel` covers momo/cash/bank;
`momo_transaction` is the reconciliation ledger that live webhooks will feed
later without reshaping anything.

---

## 9. Communication, Notifications, Documents, Assets & System

```mermaid
erDiagram
    message_template ||--o{ message_campaign : templates
    audience_segment ||--o{ message_campaign : targets
    message_campaign ||--o{ message_recipient : sends_to
    member ||--o{ message_recipient : receives
    member ||--o{ communication_consent : consents
    app_user ||--o{ notification : receives
    notification ||--o{ notification_delivery : delivered_via
    app_user ||--o{ notification_preference : sets

    document_folder ||--o{ document : holds
    document ||--o{ document_version : versioned_by
    document ||--o{ document_access : restricted_by

    asset_category ||--o{ asset : classifies
    asset ||--o{ asset_maintenance : serviced_by
    asset ||--o{ asset_assignment : assigned_via

    report_definition ||--o{ report_run : executed_as
    report_definition ||--o{ report_schedule : scheduled_as
    assembly ||--o{ activity_log : audited_in
    app_user ||--o{ activity_log : acts_in
```

---

### Validation note

These diagrams are the human view; the **authoritative** schema is the DDL in
[`docs/schema/`](./schema). Before Phase 3, we'll load the DDL into a local
Supabase instance to confirm every FK, index, and RLS policy compiles and that
the cross-assembly isolation tests pass.
