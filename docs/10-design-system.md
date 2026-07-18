# 10 — Design System & UI Foundations

> **Artifact:** The visual language and interaction foundations — tokens, color,
> typography, spacing, motion, accessibility, and the component library — that
> make 24 modules feel like one product. **Owner:** UI/UX Designer + Frontend
> lead. **Status:** Phase 4 — in review.

---

## 1. Design principles (the bar)

1. **Calm, not busy.** A church officer opens a screen and immediately knows the
   one thing to do. Generous whitespace, clear hierarchy, few competing accents.
2. **Legible first.** Larger base type, high contrast, big touch targets — this
   runs on mid-range Android in bright Ghanaian daylight.
3. **Forgiving.** Undo over confirm where safe; soft deletes; clear empty states
   that teach; skeletons over spinners; optimistic UI that never lies about sync.
4. **Consistent.** One way to do a list, a form, a detail page, a filter. Learn
   one module, you know them all — the UI mirror of our uniform code modules.
5. **Accessible by default** (WCAG 2.1 AA): keyboard-complete, labelled, focus-
   visible, motion-reduced when requested, AA contrast in both themes.

## 2. Design tokens (the single source of visual truth)

Tokens are CSS variables consumed by Tailwind (via `@theme`) and shadcn/ui. Light
and dark are token swaps — components never hardcode color.

```css
:root {
  /* Brand — Church of Pentecost identity (deep blue + gold accent) */
  --brand-50:#eef4ff; --brand-100:#d9e6ff; --brand-500:#1e4fd6;
  --brand-600:#1740b3; --brand-700:#12318a; --brand-900:#0b1f57;
  --accent-500:#e0a615;  /* gold */  --accent-600:#b98510;

  /* Semantic (map to brand/neutrals; components use ONLY these) */
  --background:#ffffff;      --foreground:#0b1220;
  --card:#ffffff;            --card-foreground:#0b1220;
  --muted:#f3f5f9;           --muted-foreground:#5b6472;
  --border:#e4e8ef;          --input:#e4e8ef;   --ring:var(--brand-500);
  --primary:var(--brand-600);--primary-foreground:#ffffff;
  --secondary:#eef2f8;       --secondary-foreground:#0b1220;
  --success:#1a8f5a; --warning:#c67a0a; --danger:#c8362f; --info:#1e6fd6;

  /* Radii, spacing base, elevation */
  --radius:0.625rem;                       /* rounded-xl feel */
  --shadow-sm:0 1px 2px rgb(11 18 32/.06);
  --shadow-md:0 4px 16px rgb(11 18 32/.08);
}

.dark {
  --background:#0b1220;      --foreground:#e8ecf4;
  --card:#121a2b;            --card-foreground:#e8ecf4;
  --muted:#1a2436;           --muted-foreground:#9aa6b8;
  --border:#243149;          --input:#243149;   --ring:var(--brand-500);
  --primary:var(--brand-500);--primary-foreground:#0b1220;
  --secondary:#1a2436;       --secondary-foreground:#e8ecf4;
  --success:#3ec27f; --warning:#e0a615; --danger:#f0655c; --info:#5aa0ff;
}
```

- **Dark mode** is first-class (`class` strategy, system-aware + manual toggle,
  persisted per user). Every surface, border, and state has a dark token.
- **Semantic-only rule:** components reference `--primary`, `--muted-foreground`,
  etc. — never `--brand-600` directly. Rebrand = edit the map, done.

## 3. Typography

- **Sans (UI):** Inter (with a system-font fallback stack so it renders instantly
  offline). **Numeric/tabular** variant for finance & report tables.
- **Scale** (rem, 1.250 major-third-ish, tuned for readability):
  `xs .8125 · sm .875 · base 1 (16px) · lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875 · 4xl 2.25`.
  Base is **16px minimum** everywhere (never smaller for body).
- **Weights:** 400 body, 500 medium (labels/nav), 600 semibold (headings),
  700 for page titles. Line-height 1.5 body, 1.2 headings.

## 4. Spacing, layout & grid

- **4px base unit**; Tailwind spacing scale. Comfortable default density with an
  optional **compact density** toggle for data-heavy admins (finance, reports).
- **App shell:** left sidebar nav (collapsible) + top bar (breadcrumbs, global
  search, notifications, user) + content. On mobile the sidebar becomes a bottom
  tab bar + drawer.
- **Content max-width** ~1280px for forms/detail; tables go full-width with
  horizontal scroll contained.
- **Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. **Mobile-first**
  — every screen is designed at 360px first, enhanced up.

## 5. Component library (shadcn/ui, owned in-repo)

shadcn primitives are **copied into `components/ui/`** (not a black-box dep), so
we fully control accessibility and theming. Core set:

- **Inputs:** Button, Input, Textarea, Select, Combobox, DatePicker (dd/mm/yyyy,
  Africa/Accra), PhoneInput (+233 mask), Checkbox, Radio, Switch, Slider, FileDrop.
- **Data:** DataTable (sort/filter/paginate/virtualized), Card, Stat/KPI tile,
  Badge, Avatar, Timeline, EmptyState, Skeleton, Pagination.
- **Overlay:** Dialog, Sheet (mobile forms), Drawer, Popover, Tooltip, DropdownMenu,
  ContextMenu, CommandPalette (⌘K), Toast/Sonner.
- **Nav:** Sidebar, Breadcrumbs, Tabs, BottomNav (mobile), Stepper.
- **Feedback:** Alert, ConfirmDialog, ProgressBar, ConnectivityBanner (offline).
- **Charts:** Recharts wrappers (Line, Bar, Area, Donut) themed to tokens, with
  accessible tables behind every chart.

Every interactive component ships: keyboard support, `aria-*`, visible focus
ring, disabled/loading states, and a Storybook-style usage doc.

## 6. Patterns (built once, reused everywhere)

| Pattern | Behaviour |
|---|---|
| **List page** | Toolbar (search, filters, density, export, "New") → DataTable → empty/skeleton states. Identical across modules. |
| **Detail page** | Header (title, status badges, quick actions) → tabbed sections → activity timeline + audit tab. |
| **Create/Edit** | RHF + Zod; inline field errors; autosave drafts where long; Sheet on mobile, Dialog/route on desktop. |
| **Loading** | Skeletons that match final layout (no layout shift); never a bare spinner on first paint. |
| **Empty** | Friendly illustration + one-line explanation + primary action ("Add your first member"). |
| **Errors** | Human message + `requestId`; retry affordance; never a raw stack. |
| **Bulk** | Selection toolbar (count, actions: SMS, assign cell, export, delete). |
| **Confirm vs Undo** | Undo toast for reversible actions; ConfirmDialog only for destructive/irreversible. |

## 7. Command Palette & Global Search (⌘K / long-press)

- One keystroke to: jump to any member/cell/ministry/event, run an action
  ("Mark attendance", "New contribution"), or navigate. Fuzzy, keyboard-driven,
  permission-filtered (you only see what you can do).
- Global search box in the top bar mirrors it for mouse/touch users; results
  grouped by entity with trigram-backed fuzzy matching.

## 8. Motion (Framer Motion — tasteful, purposeful)

- **Durations:** 150–250ms; **easing:** standard ease-out for enters.
- Page/tab transitions (subtle fade+slide), list item enter/exit, sheet/dialog
  spring, skeleton shimmer, number count-ups on dashboard stats.
- **`prefers-reduced-motion` fully honored** — motion degrades to instant.

## 9. Accessibility commitments (WCAG 2.1 AA)

- Full keyboard operability incl. the command palette and data tables.
- Contrast AA in **both** themes (tokens chosen to pass; validated in CI with an
  automated contrast check).
- Every input labelled; errors announced via `aria-live`; focus managed on
  route/dialog changes; skip-to-content link.
- Charts always paired with an accessible data table / summary.
- Target size ≥ 44px on touch; language set to `en-GH`.

## 10. Localization & formatting (Ghana)

- Currency `GHS` with grouping; phone `+233` display/entry; dates `dd/mm/yyyy`;
  times 24h or 12h per user pref; timezone `Africa/Accra`.
- Copy is friendly and plain-English; strings centralized for future
  Twi/Ga/other-language support (i18n-ready, not translated in V1).
