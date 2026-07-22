# BEAMS — Berea English Assembly Management System

An enterprise-grade, multi-tenant-ready church management platform for
**The Church of Pentecost — Berea English Assembly** (Dansoman Area, Sahara
District, Accra, Ghana).

Built to the quality bar of commercial ChMS SaaS (Planning Center, ChurchSuite,
Breeze) and architected from day one to scale from a single assembly to hundreds.

---

## Status

🟢 **Implementation complete (M0–M10).** All 24 modules built and verified
against the live database. See [16 — Launch Readiness](./docs/16-launch-readiness.md)
for what must happen before real member data goes in.

Originally: No production code is written yet. We are producing the
12 planning artifacts required before implementation begins. See
[`docs/`](./docs) and the [Decision Log](./docs/decisions/DECISION-LOG.md).

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Vision & scope, system architecture, project structure, feature breakdown | ✅ Delivered |
| **2** | Database schema (114 tables), ERD, RLS policies | ✅ Delivered |
| **3** | API design, auth & security, permission matrix | ✅ Delivered |
| **4** | UI/UX wireframes, component hierarchy, user flows, state management | ✅ Delivered |
| **5** | DevOps, deployment, backup & disaster recovery, roadmap | ✅ In review |
| **6+** | Production implementation, M0–M10 — see [roadmap](./docs/15-implementation-roadmap.md) | ✅ Complete |

## Technology Stack

**Frontend:** Next.js 15 (App Router) · React 19 · TypeScript (strict) ·
TailwindCSS · shadcn/ui · Framer Motion · React Hook Form · Zod · TanStack Query

**Backend:** Supabase (PostgreSQL · Auth · Storage · Edge Functions) · Row-Level
Security for tenant isolation

**Localization (Ghana):** Arkesel/Hubtel SMS · Mobile Money (MTN / Telecel /
AirtelTigo) finance · Resend email

**Hosting:** Vercel (web) · Supabase (managed Postgres) · Railway (workers/cron)

## Documentation Index

- [01 — Vision & Scope](./docs/01-vision-and-scope.md)
- [02 — System Architecture](./docs/02-system-architecture.md)
- [03 — Project & Folder Structure](./docs/03-project-and-folder-structure.md)
- [04 — Feature Breakdown](./docs/04-feature-breakdown.md)
- [05 — Database Schema](./docs/05-database-schema.md) · DDL in [`docs/schema/`](./docs/schema)
- [06 — Entity Relationship Diagram](./docs/06-erd.md)
- [07 — API Design](./docs/07-api-design.md)
- [08 — Authentication, Sessions & Security](./docs/08-auth-and-security.md)
- [09 — Permission Matrix (RBAC)](./docs/09-permission-matrix.md)
- [10 — Design System & UI Foundations](./docs/10-design-system.md)
- [11 — Wireframes & Screen Inventory](./docs/11-wireframes.md)
- [12 — Component Hierarchy](./docs/12-component-hierarchy.md)
- [13 — User Flows & State Management](./docs/13-user-flows-and-state.md)
- [14 — DevOps, Deployment & Disaster Recovery](./docs/14-devops-deployment-dr.md)
- [15 — Implementation Roadmap](./docs/15-implementation-roadmap.md)
- [16 — Launch Readiness](./docs/16-launch-readiness.md)
- [Decision Log (ADRs)](./docs/decisions/DECISION-LOG.md)

## Guiding Principles

Enterprise-grade · Multi-tenant from day one · Mobile-first · Accessible (WCAG
2.1 AA) · Offline-friendly where practical · Audit-ready · Usable by church
officers with little computer experience · Dark mode · Ghana-localized.
