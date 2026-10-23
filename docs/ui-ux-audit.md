# Ausgegeben — UI/UX audit (web first, Android parity tracked separately)

**Date:** 2026-10-23 · **Base commit:** `main` @ `89d2594` · **Branch:** `ui/ux-audit-and-polish`
**Scope of this document:** evidence-based register of confirmed defects in the *current* source, plus
design weaknesses, hypotheses and enhancements kept explicitly apart. Nothing here is a claim about
code I did not open — see "What was inspected" for the exact list.

> Note: the open recovery PR (#89, branch `audit/restore-batch-budget`) touches only data/recovery code.
> This work branches from `main` and does not overlap it.

---

## What was inspected (and what was not)

**Read in full:** `views/MainShell.tsx`, `views/RecordView.tsx` (filter/total wiring), `views/AddTransactionView.tsx`,
`viewmodels/useAddTransactionViewModel.ts`, `components/FinanceSummaryCard.tsx`, `components/PeriodSelector.tsx`,
`utils/analytics.ts#computeTotals`, `theme/tokens.ts` (structure).
**Inventoried by size/structure:** all 7 views, all 17 components, all 11 theme files (`pages.css` 3.6k lines,
`layout.css` 681, `global.css` 435), 3 hooks (`useFocusTrap`, `useBodyScrollLock`, `useHaptics`).
**Greps (evidence only):** navigation/history APIs, unsaved-change handling, discard strings (en/de), keyboard
handlers, `computeTotals` call sites.

**Not yet inspected** (so not reported on): `AuthView`, `OnboardingView`, `SettingsView` (1.1k lines),
`CategoriesView`, `InsightsView` and its charts beyond `computeTotals`, the Android UI beyond
`AddTransactionScreen`'s discard dialog, and all CSS internals beyond class-name usage.

Known strengths worth preserving (verified, not assumed): skip link + `aria-current` on both navs, inactive tab
panels are `inert` **and** `aria-hidden` (so background content is neither focusable nor announced), the
transaction editor already traps focus, locks body scroll, exposes `role=dialog`/`aria-modal`/`aria-labelledby`,
marks `aria-invalid`/`aria-describedby` on the amount and category fields, uses `aria-pressed` on the category
chips, and the analytics period picker is a proper focus-trapped dialog. Category chips are buttons, segmented
control is a real control, and every icon-only control carries an `aria-label` + `title`.

---

## Confirmed defects (reproducible from source)

| # | Issue | Severity | Evidence | User impact | Fix | Complexity | Regression risk | Verification |
|---|---|---|---|---|---|---|---|---|
| **UX-1** | **Editing an existing transaction discards edits with no confirmation.** `requestClose()` only prompts when `!vm.isEditing`; Escape, backdrop click and the ✕ all close an edited form immediately. | **Critical** (silent data loss) | `views/AddTransactionView.tsx:43-63` (`if (!vm.isEditing && hasUnsavedChanges)`), comment on :43-44 states the create-only intent | User edits amount/note/category, hits Escape or the backdrop by habit, loses the edit with no warning and no undo | Baseline the loaded row and prompt on *any* real change (create **and** edit); no prompt when nothing changed | S | Low — touches only the close path, not persistence | Pure `isFormDirty` unit tests for create + edit + no-op reformat; editor still saves unchanged |
| **UX-2** | **"balance" label for a period net.** The headline number is `income − expenses` for the selected period (`computeTotals().net`; transfers excluded from `net`), labelled `summaryBalance: 'balance'`. | **High** (financial misinterpretation) | `components/FinanceSummaryCard.tsx:15,21`; `i18n/en.ts:120`; `utils/analytics.ts:35-51` | A reader can take it as their *account* balance, and a month with transfers shows a net that excludes them | Rename to "net this period" / "net cash flow" (en + de), keep the formula, surface transfers when non-zero so the number is explainable | S | Low — copy + one conditional row | Unit test that the label key changed and `computeTotals` is untouched; screenshot check |
| **UX-3** | **Day-group totals ignore the active filter.** Rows are search/type/category filtered but each date group's total is computed from the unfiltered period. The source calls this intentional Android parity. | **High** (visible numbers disagree with visible rows) | `views/RecordView.tsx:73-83` ("Period day totals stay unfiltered (Android parity)") | Filter to one category and the group totals still add up the whole day; user cannot tell what the number refers to | Sum the *visible* rows when a filter/search is active, and keep unfiltered totals when none is; label the state so it is unambiguous | M | Medium — display-only, but the day-total map is shared with the record list | Fixture-driven tests: filtered total ≠ unfiltered, empty result shows 0, no-filter path unchanged |
| **UX-4** | **No history integration: browser Back leaves the app.** Navigation is `useState<Tab>`; there is no `popstate`/`pushState`/URL sync anywhere in `web/src`. | **High** (web/PWA navigation contract) | `views/MainShell.tsx:30` (`useState<Tab>`); grep for `popstate|pushState|replaceState|location.hash|useNavigate` returns **zero** matches | Android-style "back closes the tab" — in an installed PWA, Back exits the app instead of returning to the previous tab; deep links are impossible | Sync the active tab to the URL hash with `history.pushState` + a `popstate` listener; focus the panel heading after a keyboard/Back-driven switch | M | Medium — must not remount views or lose form state; keep panels mounted | Tests for hash→tab, tab→hash, popstate switching, unknown hash falls back to record |
| **UX-5** | **The period listbox has no keyboard model and no accessible name.** Trigger advertises `aria-haspopup="listbox"`, the menu is `role="listbox"`, but there is no arrow/Home/End handling, focus never enters the list, and the listbox has no `aria-label`/`aria-labelledby`. | **High** (WCAG 2.1.1 keyboard, 4.1.2 name/role) | `components/PeriodSelector.tsx:47-90` (trigger `aria-haspopup`; menu `role="listbox" id`; options are `<button role="option">`; no `onKeyDown`; Escape listener at :34-36 closes only) | Keyboard and screen-reader users get a popup that behaves like nothing they expect: no arrow navigation, an unnamed list, no focus movement or restoration | Implement the listbox pattern (roving focus, Arrow/Home/End, Enter/Space, Escape + focus restore), or replace with a native `<select>` where the option set is simple | M | Medium — used by Record period + any other listbox consumer | Component tests for each key; axe check for the accessible name |

## Design weaknesses (judgement, with evidence — not bugs)

| # | Observation | Evidence | Recommendation |
|---|---|---|---|
| DW-1 | Mobile nav is **icon-only**; labels exist only in `aria-label`/`title`, so sighted users must infer meaning from glyphs. | `MainShell.tsx:187-198` | Add visible labels under the mobile icons (or a selected-state label), keep the desktop rail. |
| DW-2 | The summary card's *value* has no unit context beyond the currency symbol, and the eyebrow sets "balance · period" in a small–caps style. | `FinanceSummaryCard.tsx:20-27`; `.finance-summary-card__eyebrow` in `pages.css` | Pair the number with its period in normal case, and let the label carry the semantics (depends on UX-2). |
| DW-3 | Two different period-selection idioms coexist: an inline listbox popup (Record) and a bottom-sheet dialog (Insights). | `PeriodSelector.tsx` (both components) | Pick one interaction for period selection; the sheet is the better mobile pattern. |
| DW-4 | `pages.css` is 3 638 lines for a 7-view app; visual rules for one component can live three files away (`polish.css`, `premium.css`, `ios.css`, `layout.css`). | file sizes in `web/src/theme` | Not a defect a user sees, but it makes every visual change risky. Consolidate per-component rules as components are touched (opportunistic, not a rewrite). |

## Hypotheses (need user testing or measurement — not asserted as defects)

* **H-1** The transaction editor's field order (type → amount → date → category → note) puts the category rail — a long horizontal scroll — above the note, which may bury the primary action on small screens. Measure with a scroll-depth/tap-count probe at 320 px.
* **H-2** The editor's "Save" label is lower-cased in the button (`t('actionSave').toLowerCase()`) while other buttons keep sentence case; users may read the all-lowercase style as disabled/secondary. Needs a quick preference test.
* **H-3** Swipe-to-delete discoverability on the transaction list is unknown; the gesture has no visible affordance until used.
* **H-4** Insights charts have accessible names (`chartCashFlow` etc.) but the *data* is not exposed as text; screen-reader users may get a picture description with no numbers.

## Optional enhancements (explicitly not required by the current brief)

* Category drill-down from Insights into a filtered Record view.
* "Budget pace" projection on the record header.
* Keyboard shortcut for "new transaction" on desktop.

---

## Prioritised backlog (this branch)

**P0 — UX-1 and UX-2 shipped in this round; UX-5 next**
1. ✅ **UX-1** unsaved-edit protection — *done*: `isFormDirty`/`toTransactionBaseline` in `useAddTransactionViewModel.ts`, the create-only gate removed from `AddTransactionView.tsx`, 14 new tests in `addTransactionDirty.test.ts` (create + edit + reformat + date-time-of-day + orphan-category cases). Android still uses the create-only gate and is tracked for the parity pass.
2. ✅ **UX-2** financial terminology — *done* on **both** platforms: `summaryBalance` → "net cash flow" (en) / "überschuss" (de) in `i18n/en.ts` + `i18n/de.ts`, and `summary_balance_period` → "Net cash flow · %1$s" / "überschuss · %1$s" in the Android resources. Formula untouched. Surfacing a transfers row (Android already defines a `summary_transfers` plural; web shows transfers only on Insights) is deferred to the visual pass so it lands on both platforms at once.
3. ⏳ **UX-5** period listbox keyboard + accessible name — next round; the pure navigation logic will be extracted so it is testable without a DOM harness (this repo has no component-testing setup).

**P1 — next rounds**
4. **UX-3** filtered vs unfiltered day totals, with documented semantics and fixtures.
5. **UX-4** hash-based tab history with `popstate`, focus handling, and no state loss.

**P2 — visual implementation (after P0/P1 land)**
6. Token pass: extend `tokens.ts` (surface hierarchy, semantic income/expense/transfer already exist) and audit contrast across the 8 palettes.
7. Shell: visible mobile nav labels (DW-1), desktop rail refinement.
8. Dashboard: summary card + budget progress + transaction rows.
9. Editor: field order/ergonomics (H-1), save-button affordance (H-2), swipe affordance (H-3).
10. Insights: chart text alternatives (H-4), one period idiom (DW-3).

**P3 — Android parity**
11. Mirror UX-1 and UX-2 in `AddTransactionScreen`/`AddExpenseViewModel` and strings; confirm Compose semantics; no CSS-like patterns.

---

## Method notes

* Every "confirmed" row above cites a file and the line where the behaviour is decided; a reviewer can
  check each one without running the app.
* Nothing in this document claims a manual screen-reader (VoiceOver/TalkBack) session, a browser matrix run,
  or a visual diff — those are Phase 6 items and will be reported with real output or as blocked.
* Financial formulas are treated as fixed contracts: `computeTotals`, `sumMonthExpenses` and the
  currency handling are not changed by this work; only their *labels* and *presentation*.
