# Ausgegeben — UI/UX design specification

**Status:** direction and inventory for Round 3. No visual code changes were made in Round 2, by
design — this document exists so the visual pass has an agreed target instead of being improvised.
**Branch:** `ui/ux-audit-and-polish` · **Companion:** `docs/ui-ux-audit.md` (defects + evidence).

---

## 1. Design principles

1. **The numbers are the interface.** A finance screen earns its space by answering "how much",
   "how am I doing", "what changed" — every other element competes with that.
2. **One idea per surface.** A card holds one question. Two numbers that mean different things
   (period net vs filtered-list total) are never presented as if they were the same thing.
3. **Quiet by default, loud when it matters.** Colour carries meaning (income / expense /
   transfer / over budget) rather than decoration; everything else is neutral surface and text.
4. **Predictable state, always.** Loading, empty, offline, filtered-to-nothing, truncated cache,
   permission-denied and error states are designed states with their own copy — not a blank area.
5. **Native where it counts.** Real controls (buttons, inputs, labels, listboxes) that behave the
   way the platform and assistive technology expect; no clickable `<div>` stand-ins, no aria
   retrofitted onto non-semantic markup.
6. **Mobile ergonomics first, desktop deliberately.** Thumb-reachable primary action, 44 px
   minimum targets, no important row below the fold on a 375 px viewport.

## 2. What is retained, refined, or deferred

| Decision | Item |
|---|---|
| **Retained** | The 8 palettes (including AMOLED) and their token names; the card/`card--pro` surface language; the bottom-pill nav + FAB on mobile and the header rail on desktop; the transaction-row anatomy (icon tile, title, meta, amount); the numeric keypad entry model on Android; all copy in `en`/`de`. |
| **Refined (Round 3)** | Surface hierarchy (one elevation step, not three); type scale with explicit roles; spacing on the existing 4 px scale; summary card semantics; day-header typography (no 11 px uppercase micro-labels); Insights chart hierarchy; Settings section rhythm. |
| **Deferred** | Any new framework, icon set, chart library, animation system; Android visual restyle beyond parity fixes; marketing/landing surface. |

## 3. Tokens (current, verified in `web/src/theme/tokens.ts`)

**Spacing** — 4 px base: `xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 40`.
**Radius** — `xs 4 · sm 6 · md 10 · card 16 · xl 24 · pill 999`.
**Palette keys per theme** — `primary`, `onPrimary`, `background`, `onBackground`, `surface`,
`onSurface`, `surfaceVariant`, `onSurfaceVariant`, `outline`, `error`, `income`, `incomeLight`,
`expense`, `transfer`, `focusRing`, `isDark`.
**Themes** — `light`, `dark`, `amoled`, `midnight`, `ocean`, `forest`, `sunset`, `lavender`,
`soft_light` (+ `system`), applied by `applyTheme` writing `--color-*` custom properties.
**Android parity** — tokens are mirrored from `Color.kt` / `ThemePalettes.kt` / `AppTheme.kt`;
changing one side without the other is a defect, not a style choice.

**Round 3 additions (proposed, additive only):**
`--surface-raised` (one step above `surface`, for the transaction list rows), `--state-hover` /
`--state-pressed` (derived from `on-surface` at 5 % / 8 %, replacing per-component
`color-mix` literals), `--text-metric` / `--text-section` / `--text-body` / `--text-meta` role
variables, and `--space-*` aliases so CSS stops hard-coding 12/14/16 px padding per component.

## 4. Typography roles

| Role | Web | Android | Notes |
|---|---|---|---|
| Screen title | 20–24 px, 600 | `headlineSmall` | one per screen, always an `h1` |
| Section heading | 18–20 px, 600 | `titleMedium` | `h2` inside the screen |
| Metric (hero number) | 28–36 px, 600, tabular | `displaySmall` | tabular figures so amounts align |
| Body | 16 px | `bodyLarge` | never below 16 px for anything a user must read |
| Meta / secondary | 14 px | `bodyMedium` | replaces today's 11 px uppercase labels |
| Micro label | 12 px minimum, **never** for essential information | `labelSmall` | e.g. "16:42" |

Text scaling is a hard requirement: 200 % zoom (web) and system font scale (Android) must not clip
a metric, a row, or the primary action.

## 5. Surface hierarchy and elevation

```
background  →  surface (card)  →  surface-raised (list row / menu)  →  overlay (dialog, sheet)
```
One border and one shadow step, both from tokens; no glassmorphism on data surfaces (the current
backdrop blur on the transaction modal is allowed to stay as a *modal* device only).

## 6. Component inventory

| Component | Web | Android | Round-3 work |
|---|---|---|---|
| App shell / nav | `MainShell.tsx` (header rail + bottom pill + FAB) | `MainActivity` + `MainBottomBar` | visible labels on mobile nav; single selected-state treatment |
| Period selector | `PremiumPeriodSelector` (ARIA listbox, fixed in Round 2) | `AnalyticsPeriodPicker`-style sheet | align on one idiom (see `DW-3` in the audit) |
| Finance summary | `FinanceSummaryCard` | `FinanceSummaryCard` | "net cash flow" wording (done); transfers row when non-zero |
| Transaction row | `SwipeableRow` + row anatomy | `RecordScreen` rows | tabular amounts, consistent row height, visible swipe affordance |
| Transaction editor | `AddTransactionView` (dirty-guarded, Round 1) | `AddTransactionScreen` | field order, save-button prominence, keyboard-safe footer |
| Charts | `DonutChart`, `CashFlowChart`, `BudgetProgressBar` | Compose charts | text alternatives, one legend convention, period context in the title |
| Dialogs | `ConfirmDialog`, `useFocusTrap` | Compose dialogs | shared destructive-action treatment |
| States | `EmptyState`, `LoadingListSkeleton`, `DataTruncatedBanner`, `SyncErrorBanner` | Compose equivalents | one copy voice; every state has an action |

## 7. Responsive principles (web)

| Width | Layout |
|---|---|
| 320–430 | single column; summary card first, list immediately after; bottom nav + FAB; no horizontal scroll at 320 |
| 768+ | sidebar (summary, budget, filters) + list column; header rail replaces bottom nav |
| 1024–1440 | same two-column grid, max line length on rows; no additional chrome |

Safe areas (`env(safe-area-inset-*)`) on the fixed nav and modals; modal footer stays above the
on-screen keyboard; landscape keeps the primary action visible.

## 8. Accessibility contract (per screen)

* Landmarks: `header` / `nav[aria-label]` / `main#app-main` / `complementary` (sidebar).
* One `h1` per screen, heading order never skips.
* Focus: visible ring from `--color-focus` (3 px), focus restored after any dialog/popup closes,
  programmatic focus only for history navigation and dialog entry.
* Live regions: errors `role="alert"`, progress/information `role="status"` + `aria-live="polite"`.
* Charts: accessible name + a text summary of the series (numbers, not adjectives).
* Status is never colour-only: income/expense/transfer carry a sign or icon as well as hue.
* Targets ≥ 44 × 44 px; 200 % text scaling without loss.

## 9. Round-3 backlog (visual, in order)

1. Token additions + type roles (§3, §4) — no component changes.
2. Shell: mobile nav labels, selected state, FAB placement.
3. Dashboard: summary card, budget row, day headers, row density, filter affordance.
4. Editor: field order, footer/keyboard behaviour, focus on open.
5. Insights: hierarchy, chart text alternatives, period context.
6. Settings/Categories: section rhythm, destructive-action grouping.
7. Android parity for each of the above, one screen at a time.

Each step ships with the existing test suites green plus a screenshot set captured from the
seeded demo account (light + dark, 375 px + 1280 px).
