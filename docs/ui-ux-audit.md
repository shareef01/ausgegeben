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
| **UX-3** | **Day-group totals ignored the active filter.** Rows were search/type/category filtered but each date group's total came from the unfiltered period. | **High** (visible numbers disagreed with visible rows) | `viewmodels/useRecordViewModel.ts` (two independent memos) + `views/RecordView.tsx:73-83` | Filtering to one category left day headers adding up the whole day | **Fixed in Round 2:** `buildRecordList` derives rows *and* totals from one input; `groupRecordRows` owns the grouping; a note explains the difference while a filter is active | M | Low — display-only | `recordDayTotals.test.ts` (19 tests: search/type/category/min/max/combined, both sort axes, same-day, midnight, orphan category, empty) |
| **UX-4** | **No history integration: browser Back left the app.** Navigation was `useState<Tab>`; there was no `popstate`/`pushState`/URL sync anywhere in `web/src`. | **High** (web/PWA navigation contract) | `views/MainShell.tsx` + repo-wide grep returning **zero** matches | In an installed PWA, Back exited the app instead of returning to the previous tab; no tab was linkable | **Fixed in Round 2:** tab lives in `?tab=` (not the fragment — `#app-main` is the skip-link target); `pushState` on change, `popstate` re-reads the URL, mount normalises with `replaceState`, focus moves to `#app-main` on Back/Forward only, visited panels stay mounted and `inert` | M | Low (verified: no remount, state preserved) | `tabHistory.test.ts` (15) + `e2e/tabHistory.spec.ts` in Chromium: history entries, Back/Forward, duplicate suppression, URL on load, invalid fallback, reload, unrelated params, skip link |
| **UX-5** | **The period listbox had no keyboard model and no accessible name.** | **High** (WCAG 2.1.1, 4.1.2) | `components/PeriodSelector.tsx` (no `onKeyDown`, focus never entered the list, unnamed listbox) | Keyboard/AT users got a popup that behaved like nothing they expect | **Fixed in Round 2:** WAI-ARIA listbox with roving tabindex, focus-on-open, Arrow/Home/End, native Enter/Space activation, Escape and Tab both restore focus to the trigger, `aria-labelledby` names trigger and listbox; index maths extracted to `utils/listbox.ts` | M | Low | `listbox.test.ts` (12) + `e2e/periodSelector.spec.ts` in Chromium: name, focus-on-open, arrow/wrap, Home/End, Enter, Escape + focus restore, selection state, pointer path, single tabbable option |

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
3. ✅ **UX-5** period listbox keyboard + accessible name — *done*: full WAI-ARIA listbox pattern in `components/PeriodSelector.tsx` (roving tabindex, focus-on-open, Arrow/Home/End, native Enter/Space, Escape/Tab restore focus, `aria-labelledby` for trigger and listbox), index maths in `utils/listbox.ts`. A native `<select>` was considered and rejected: the popup carries the selected-state check icon and the month list, and swapping it would be a visual regression ahead of the Round-3 redesign. **Verified in Chromium** (`e2e/periodSelector.spec.ts`), not just by unit tests.

**P1 — completed in Round 2**
4. ✅ **UX-3** day totals now follow the displayed rows. `buildRecordList` (view model) derives rows **and** totals from one input; `utils/recordGrouping.ts` owns grouping (including "amount sorting shows no day total"); `RecordView` shows a note while a filter is active so the filter-independent period summary and the filtered list totals can never look like they disagree. Covered by 19 pipeline tests.
5. ✅ **UX-4** tab history via `?tab=` (chosen over the fragment because `#app-main` is the skip-link target): `pushState` on a genuine change, `popstate` re-reads the URL, a mount-time `replaceState` normalises the URL, focus moves to `#app-main` only for history navigation, unrelated query parameters and fragments are preserved, and visited panels stay mounted/`inert`. Covered by 15 unit tests **and** `e2e/tabHistory.spec.ts` in Chromium.

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

---

# Round 2 additions

## German financial copy (Task 4)

Round 1 changed the German headline from `saldo` to `überschuss`. On review that is still wrong for
half the cases: *Überschuss* means surplus, so a zero or negative net renders as "Überschuss −120 €",
which reads as a contradiction. The label is now neutral and period-scoped on both clients:

| | before (R1) | after (R2) |
|---|---|---|
| web `en` | `net cash flow` | `net cash flow` (unchanged — already neutral) |
| web `de` | `überschuss` | **`netto im zeitraum`** |
| Android `en` | `Net cash flow · %1$s` | unchanged |
| Android `de` | `überschuss · %1$s` | **`netto im zeitraum · %1$s`** |

The formula is untouched (`computeTotals().net` = period income − period expenses, transfers
excluded on both platforms). Web renders `netto im zeitraum · Mai 2026`; Android upper-cases the
same string via `uppercase()` in `FinanceSummaryCard.kt`, which is a typography decision for Round 3.

## Expanded audit coverage (Task 5)

Previously unreviewed views are now inspected to the depth stated. I read the whole of `AuthView`
and `OnboardingView`, and — because `SettingsView` is 1 101 lines and `CategoriesView` 463 — I read
their structure and interaction-relevant regions (dialog/confirm scaffolding, section headings,
live regions, per-row action labels) rather than every line. No claim is made about their CSS.

| View | Verdict | Evidence |
|---|---|---|
| `AuthView.tsx` | **Sound.** Labelled inputs, `autoComplete` for email/current/new password, submit prevented, config error and auth error both `role="alert"`, info/sync `role="status" aria-live="polite"`, password-visibility toggle labelled, sign-in/up switch labelled. | `:110`, `:124-160`, `:181`, `:213-215` |
| `OnboardingView.tsx` | **Sound.** Step dots are buttons with `aria-current="step"` inside a labelled `group`, slide has `h2` + body, skip always available, Back hidden on the first slide. | `:45-66` |
| `SettingsView.tsx` | **Sound but large.** Section titles are real `h2`s; every destructive action (sign out, delete account, export-truncated, restore, replace) is behind a `ConfirmDialog`; sync errors, deletion-pending and unresolved-replace states are `role="alert"`. Risk is structural (one 1 101-line file, modal scaffolding repeated), not interactional. | `:440`, `:453`, `:469`, `:528-539`, `:755`, `:1017`, `:1141` |
| `CategoriesView.tsx` | **Sound.** `role="dialog" aria-modal aria-labelledby` with a focus trap that pauses for nested confirms, icon/colour groups labelled, per-row buttons named with the category (`Edit: Groceries`, `Move up: Groceries`). | `:65`, `:220-222`, `:271`, `:291`, `:364-375` |

**New confirmed defect (Low)**

| # | Issue | Severity | Evidence | Impact | Fix |
|---|---|---|---|---|---|
| UX-6 | Sign-in failure does not mark the offending field invalid: only the confirm-password field sets `aria-invalid`, so an email/password failure is announced once via `role="alert"` but the field itself carries no invalid state for AT navigation. | Low | `AuthView.tsx:181` is the only `aria-invalid`; `:213` is the alert | A screen-reader user who returns to the field later gets no indication it was rejected | Set `aria-invalid` on email/password when the corresponding error is active; keep the single alert |

**Design weaknesses confirmed (not fixed this round)**

* `DW-5` — `SettingsView.tsx` mixes nine concerns in one file with repeated modal scaffolding; splitting
  is a Round-3 (or later) refactor, not a UX defect a user sees.
* `DW-6` — Onboarding has no explicit "you can change this later" reassurance on the notification
  step; worth a copy test rather than an unverified change.

## Android parity obligations from Round 2

| Item | Obligation |
|---|---|
| UX-3 day totals | ✅ **Done in Round 4.** `ExpenseViewModel.uiState` now computes `dayTotalsByDay` from the same `filterRecords` call (same inputs) that feeds `pagedExpenses`, and `RecordScreen` shows the `record_totals_filtered` note while a filter is active. Regression test: `ExpenseViewModelTest.dayTotals_followTheFilteredRows`. |
| UX-5 period selector | Android already uses a modal sheet with real buttons; verify TalkBack announces the selected period and that the sheet traps/restores focus. No code change expected. |
| UX-1 dirty check | ✅ **Done in Round 3.** `util/TransactionDraft.kt` mirrors the web comparison (amount in cents, date as calendar day, trimmed note) and `AddExpenseViewModel` now exposes the loaded `baseline`. While doing it, a second defect surfaced: the top-bar **✕ called `onBack` directly**, bypassing the guard entirely — so a half-typed *new* transaction was discarded with no prompt even though Back was guarded. Both close paths now go through one `requestClose`. 15 unit tests. |
| UX-4 | Not applicable — Android has no URL. |
| Copy | Done: `netto im zeitraum` in `values-de`. |
---

# Round 3 additions — Android parity (UX-1)

## Two defects, not one

Parity work on the Android editor uncovered a second, wider instance of the same defect:

| # | Issue | Severity | Evidence | Fix |
|---|---|---|---|---|
| UX-7 | The top-bar **✕** called `onBack()` directly, so it discarded a half-typed **new** transaction with no confirmation — the `BackHandler` guard only ever covered the system Back gesture. | High | `AddTransactionScreen.kt` `ObsidianTopBar(onBack = onBack)` → `AppIconButton(onClick = onBack)` | Both paths now call one `requestClose` lambda |

## What changed

* `util/TransactionDraft.kt` — pure, zone-injectable comparison mirroring the web `toTransactionBaseline` / `isFormDirty`: amount in minor units (so `12,5 ≡ 12,50`), type, category id, trimmed note, and the local calendar day (a stored timestamp's time-of-day is not an edit). `isDirty` is false while no baseline exists, so an unloaded editor never prompts.
* `AddExpenseViewModel` — records the baseline once the fields are seeded (`loadForEdit` after the amount is formatted for the display currency; `resetForm` for a new transaction). The baseline uses the **selected** category id, so a row whose stored category is an orphan or the `0` sentinel (selection null) is not reported dirty on open.
* `AddTransactionScreen` — the create-only gate is gone; both the Back gesture and the ✕ route through `requestClose`.

## Tests

`TransactionDraftTest` — 15 cases: untouched create, unloaded editor, typed amount, whitespace-only note, type/category change, placeholder `"0"` vs empty, untouched edit (the regression), edit-then-undo, date-only change, pure reformat (`12,5` / `012,50` / USD `12.5`), same-day time drift, orphan-category row, minor-unit parsing (EUR and USD separators), local day key, note trimming.

Android suite: **42 suites / 348 tests, 0 failures** (9 emulator-only skips) plus `lintProdDebug`. No web or Firestore behaviour touched.
---

# Round 4 additions — Android UX-3 parity

**Defect (same class as the web UX-3):** `ExpenseViewModel` computed `dayTotalsByDay` from
`listExpensesShared` — the *unfiltered* period — while the rendered rows came from `pagedExpenses`
(search/type/category/amount filtered). Every day header therefore contradicted the rows under it
whenever a filter was active.

**Fix:** the totals are now derived inside the `uiState` combine from the same `filterRecords(...)`
call, with the same inputs, that `pagedExpenses` uses; `RecordScreen` shows
`record_totals_filtered` ("day totals reflect the active filters" / "tagesummen folgen den aktiven
filtern") while a filter is active. The period summary card stays filter-independent on both
platforms.

**One approach rejected, and why:** the first implementation made `pagedExpenses` a shared flow
(`shareIn`) and derived the totals from it, so there would be literally one filter pass. It broke six
existing view-model tests: sharing couples a public flow to the view-model lifecycle, and
`WhileSubscribed` restart behaviour under virtual time is not what those tests assert. Reverted in
favour of "one predicate, two call sites", which keeps the guarantee that matters (the rows and the
totals cannot disagree about *which* rows are visible) without changing any flow's lifecycle.

**Tests:** `ExpenseViewModelTest.dayTotals_followTheFilteredRows` — 16.0 unfiltered → 12.5 with a
search → 16.0 after clearing, all read from `uiState.dayTotalsByDay`. Android suite: 42 suites /
349 tests, 0 failures (9 emulator-only skips) + `lintProdDebug`.