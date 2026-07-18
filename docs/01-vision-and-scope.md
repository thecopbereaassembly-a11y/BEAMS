# 01 — Vision & Scope

> **Artifact:** Product vision, scope boundaries, personas, and success metrics.
> **Owner:** Product Manager + Solutions Architect. **Status:** Phase 1 — in review.

---

## 1. Vision

BEAMS is the operational backbone of Berea English Assembly: a single, trusted
place where **pastoral care, discipleship, administration, finance, and
communication** come together. It should make a church officer with little
computer experience feel that the software is quietly doing the paperwork so
they can do ministry.

The long-term vision is a **multi-assembly platform for The Church of Pentecost**
— any assembly, district, or area could onboard as a tenant — so every design
decision is made as if hundreds of churches will eventually depend on it.

## 2. The organization we are modelling

BEAMS must mirror the **real structure of The Church of Pentecost**, not a
generic "church." The CoP hierarchy is:

```
The Church of Pentecost (National / HQ)
  └── Region (e.g. Greater Accra)
        └── Area (Dansoman Area)
              └── District (Sahara District)
                    └── Local Assembly (Berea English Assembly)  ← V1 tenant
                          ├── Home Cells / Bacenta groups
                          └── Ministries (PEMEM, PEWOMOM, Youth/PENSA, Children, Evangelism, …)
```

**Implication for the data model (Phase 2):** the tenant boundary is the
**Assembly**, but the schema carries the *full org hierarchy* (region → area →
district → assembly) so that district/area-level roll-ups and future
multi-assembly reporting work without a migration. V1 seeds a single assembly.

### CoP-specific concepts we will model as first-class

- **Officer ranks:** Presiding Elder, Elder, Deacon, Deaconess, plus appointed
  roles (Secretary, Financial Secretary, Treasurer). District Pastor sits above
  the assembly.
- **Ministries / Movements:** Men's Ministry (PEMEM), Women's Movement
  (PEWOMOM), Youth Ministry, Students (PENSA), Children's Ministry, Evangelism.
- **Discipleship pathway:** New Believers' / Foundation School, Water Baptism,
  Holy Ghost Baptism (baptism in the Holy Spirit), full membership.
- **Home Cell system:** the primary unit of shepherding and attendance.
- **Membership status lifecycle:** visitor → new convert → member → (transfer in/out) → inactive.

## 3. In scope (Version 1 — Berea English Assembly)

All 24 modules are **architecturally provisioned**, but V1 *delivery* is
prioritized in three product tiers:

| Tier | Modules (delivered as working software in V1) |
|------|-----------------------------------------------|
| **Tier 1 — Core** | Membership, Families, Home Cells, Attendance, Dashboard, Reports, User Management, Settings, Notifications, Activity Logs |
| **Tier 2 — Ministry & Care** | Ministries, Leadership, Visitors, Shepherding, Counselling, Welfare, Prayer Requests, Events, Communication |
| **Tier 3 — Extended** | Finance (MoMo-first), Documents, Assets, Evangelism |
| **Future-ready (designed, not built)** | AI Assistant, WhatsApp, Google Maps, multi-assembly onboarding |

Tiering does **not** reduce the schema or architecture — everything is designed
now. It sequences *implementation* so we ship value early and de-risk.

## 4. Out of scope for V1 (explicitly)

- Live onboarding of a second assembly (the capability exists; we won't operate it).
- Native mobile apps (the web app is installable PWA-style; native is a later track).
- Payroll / HR for church staff.
- Public-facing website / livestream (BEAMS is an internal ops platform).
- The AI Assistant is **stubbed** (interface + data contracts) but not wired to an LLM in V1.

## 5. Personas

| Persona | Computer skill | Primary needs | Key modules |
|--------|----------------|---------------|-------------|
| **District Pastor** | Medium | Oversight, pastoral reports, follow-ups | Dashboard, Reports, Shepherding, Counselling |
| **Presiding Elder** | Medium | Run the assembly, approvals, leadership | Everything (assembly-scoped admin) |
| **Secretary** | Low–Medium | Data entry, attendance, records, comms | Membership, Attendance, Communication, Events |
| **Financial Secretary / Treasurer** | Low–Medium | Record tithes/offerings (MoMo), finance reports | Finance, Reports |
| **Home Cell Leader** | Low | Weekly cell attendance & reports, member care | Home Cells, Attendance, Shepherding |
| **Ministry Leader** | Low | Ministry roster, events, attendance | Ministries, Events, Attendance |
| **Church Worker / Media** | Low | Assist with data, media, documents | Documents, Communication |
| **Member** | Low | View own profile, give, prayer requests, events | Self-service portal (read-mostly) |
| **Read-only Auditor** | Medium | Inspect records without mutating | Reports, Activity Logs (read-only) |

**Design north star:** the Home Cell Leader and Secretary personas — low
computer skill, mobile phone, sometimes offline — define our UX bar. If it works
beautifully for them, it works for everyone.

## 6. Success metrics (how we know V1 worked)

- **Adoption:** ≥ 90% of active members have a complete profile within 60 days.
- **Attendance capture:** every Sunday service and Home Cell logged within 24h.
- **Pastoral responsiveness:** follow-ups for absentees/visitors surfaced
  automatically; median follow-up time drops.
- **Report time:** monthly pastoral/attendance report goes from hours to
  one click.
- **Trust:** zero data-isolation incidents (RLS), full audit trail on every
  sensitive record (finance, counselling, welfare).

## 7. Non-functional requirements (NFRs)

| Category | Target |
|----------|--------|
| **Performance** | P75 page interactive < 2.5s on a mid-range Android over 3G; list views virtualized. |
| **Availability** | 99.9% (leans on Supabase + Vercel SLAs). |
| **Security** | RLS-enforced tenant isolation; encrypted storage; RBAC; full audit log; sensitive modules (counselling, welfare, finance) extra-restricted. |
| **Accessibility** | WCAG 2.1 AA; keyboard-navigable; screen-reader labels; sufficient contrast in light & dark. |
| **Offline** | Attendance capture & member lookup work offline, sync on reconnect (PWA + queue). |
| **Localization** | Ghana defaults: GHS currency, +233 phone formatting, Africa/Accra timezone, dd/mm/yyyy dates, Mobile Money as primary payment. |
| **Data protection** | Aligns with Ghana's Data Protection Act, 2012 (Act 843): consent, minimization, subject access, retention. |
| **Maintainability** | Strict TS, modular monolith, ≥ 80% coverage on domain logic, documented. |

## 8. Constraints & assumptions

- **Connectivity:** intermittent mobile data is the norm — offline-friendliness
  is a requirement, not a nice-to-have.
- **Devices:** predominantly mid-range Android phones; desktop for admins.
- **Budget-conscious:** favor Supabase/Vercel free-to-low tiers early; SMS/MoMo
  costs are per-transaction and must be visible/controllable.
- **Data sensitivity:** counselling and welfare records are highly confidential;
  finance is audit-critical. These shape the permission model.
