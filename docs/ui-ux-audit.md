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
| DW-1 | Mobile nav was **icon-only**; labels existed only in `aria-label`/`title`, so sighted users had to infer meaning from glyphs (the dock has no hover state to reveal a tooltip). | `MainShell.tsx` (mobile dock) | **Fixed in Round 5:** visible labels under each icon, and the label *is* the accessible name, so the visual and screen-reader names cannot diverge. The desktop rail keeps `aria-label` + `title`; visible labels there belong with the wider visual pass because the sliding indicator is sized from icon-width items. |
| DW-2 | The summary card's *value* has no unit context beyond the currency symbol, and the eyebrow sets "balance · period" in a small–caps style. | `FinanceSummaryCard.tsx:20-27`; `.finance-summary-card__eyebrow` in `pages.css` | Pair the number with its period in normal case, and let the label carry the semantics (depends on UX-2). |
| DW-3 | Two different period-selection idioms coexist: an inline listbox popup (Record) and a bottom-sheet dialog (Insights). | `PeriodSelector.tsx` (both components) | Pick one interaction for period selection; the sheet is the better mobile pattern. |
| DW-4 | `pages.css` is 3 638 lines for a 7-view app; visual rules for one component can live three files away (`polish.css`, `premium.css`, `ios.css`, `layout.css`). | file sizes in `web/src/theme` | Not a defect a user sees, but it makes every visual change risky. Consolidate per-component rules as components are touched (opportunistic, not a rewrite). |

## Hypotheses (need user testing or measurement — not asserted as defects)

* **H-1** The transaction editor's field order (type → amount → date → category → note) puts the category rail — a long horizontal scroll — above the note, which may bury the primary action on small screens. Measure with a scroll-depth/tap-count probe at 320 px.
* **H-2** The editor's "Save" label is lower-cased in the button (`t('actionSave').toLowerCase()`) while other buttons keep sentence case; users may read the all-lowercase style as disabled/secondary. Needs a quick preference test.
* **H-3** Swipe-to-delete discoverability on the transaction list is unknown; the gesture has no visible affordance until used.
* ~~**H-4** Insights charts expose a picture description with no numbers.~~ **Withdrawn in Round 9 — the hypothesis was wrong.** `CashFlowChart` announces its label *and* both totals (`role="img"` + `aria-label` containing income and expense, `CashFlowChart.tsx:162,208-209`), and `DonutChart` announces the total plus **every category with its percentage** (`DonutChart.tsx:103-113`). Verified by reading the label construction, not by assuming. No change was needed here, and none was invented.

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

---

# Round 5 additions — shell clarity, auth field state, one regression the old suite caught

## Fixed

| # | Change | Evidence |
|---|---|---|
| DW-1 | Mobile dock items now show a visible label under the icon (11 px, truncating at 4.25 rem so `einstellungen` cannot widen the dock). The label **is** the accessible name, so the visual and screen-reader names are the same string. Icons keep their 22 px size and every item keeps a >= 44 px target. | `MainShell.tsx`; `.bottom-nav-pill__item` / `__label` in `polish.css` |
| UX-6 | Sign-in now marks the field the rejection concerns with `aria-invalid`: email for "enter your email" / "already registered", password for weak or mismatched, and **both** for "invalid email or password" (either could be wrong, so guessing would be worse). Previously only the confirm-password field carried the state. | `AuthView.tsx` |

The desktop rail keeps `aria-label` + `title` for now: its sliding indicator is sized from
icon-width items, so visible labels there belong with the wider visual pass, not a one-off.

## A regression the pre-existing suite caught (fixed in this round)

Round 2 moved the active tab into `?tab=`. That made a **signed-out session leave its tab named in
the URL**, so signing out on Settings and signing in as someone else landed the next person on
Settings. `e2e/recordFilters.spec.ts`, written long before this work, failed on exactly that;
`e2e/categoryBudgets.spec.ts` failed for the same reason.

Fix: `authService.signOut()` resets `?tab=` to `record` before the shell unmounts, and the shell
also resets to Record when a *new* identity appears (tracked with a ref, so an initial `?tab=` deep
link still survives auth resolution).

Stated plainly: the Round-2 change was only verified against the specs written for it. Running the
**whole** suite is what caught this, which is why this round validates all of it.

## New verification: measured layout rather than asserted layout

`e2e/layout.spec.ts` (2 Chromium tests) measures at 320 / 375 / 390 / 430 px and 768 / 1024 / 1440 px:

* document `scrollWidth <= clientWidth + 1` at every width — no horizontal scrollbar;
* every dock item shows a label, is >= 44 x 44 px, and sits fully inside the viewport;
* the dock is **absent from the DOM** at desktop widths, where the header rail is present instead.

## Test evidence (all executed)

```
web unit            41 files / 422 tests passed
tsc --noEmit        clean
lint:css            528 class tokens, no undefined utilities
vite build          ok
Playwright/Chromium 16/16 passed — authLifecycle, categoryBudgets, recordFilters,
                    recurring, tabHistory, periodSelector, layout (the whole suite)
```

---

# Round 6 additions — summary explainability, day labels, and a dock bug the screenshot found

## Changed

| # | Change | Evidence |
|---|---|---|
| UX-2 (follow-up) | The summary now shows **transferred** (amount + count, via `computeTotals().transferCount`) whenever the period contains transfers, so `net cash flow` (income − expenses) is explainable instead of looking like it dropped rows. | `FinanceSummaryCard.tsx`, `analytics.ts`, `.finance-stat-chip--transfer` in `premium.css`; analytics unit test |
| DW-2 (partial) | Day-group labels were an 11px all-caps micro-label; now 13px sentence case at weight 600 (desktop 14px), in both `layout.css` and `polish.css`, with the inline Tailwind utilities removed so one source governs. | `RecordView.tsx`, `layout.css`, `polish.css` |
| DW-1 (fix) | Once the dock items gained labels, the nav pill widened **over the FAB** at 390px. The pill can now shrink (`flex: 0 1 auto; min-width: 0`), items shrink to their 44px minimum, and the FAB is `flex: 0 0 auto`. | `polish.css` |

## How that dock bug was found — and why the test now catches it

The captured 390px screenshot showed "settings" half-hidden behind the + button, while
`e2e/layout.spec.ts` was green. The assertion measured **document** overflow, which an overlapping
*flex sibling* does not cause. `layout.spec.ts` now also asserts
`pill.right <= fab.left + 1` at every mobile width, so the class of bug cannot come back silently.

Screenshots were captured (Playwright, emulator-backed, seeded inline) to a **temporary directory
outside the repo**: record at 1280x880 and 390x844 in light and dark, insights desktop light, and
the editor desktop light. They are working evidence for this round, not committed assets — the
published README images were not touched, and there is still no *before* set for these rounds (that
needs a second worktree plus a second seeded emulator run).

## Still visible in the captures (next slice)

* The summary eyebrow ("NET CASH FLOW · THIS MONTH") is still an 11px all-caps micro-label, and
  "MOST SPENT ON GROCERIES" is a full-width uppercase bar that reads like an alert rather than
  information. Both are the DW-2 antipattern the spec names; they need the typography pass, not a
  one-line change.
* The card's hero number is 36px+ with a gradient/shadow treatment; the spec's target is 28-36px
  with tabular figures and no glow on data.
* Android equivalents (`summary_balance_period` is `uppercase()`-ed in Compose, `labelStyle()`
  everywhere) — same pass, second platform.

## Test evidence

```
web unit            41 files / 423 tests passed   (+1: transfers counted for the summary)
tsc --noEmit        clean
lint:css            527 class tokens, no undefined utilities
vite build          ok
Playwright/Chromium 16/16 full suite + layout spec re-run after the dock fix (3 targeted, green)
```
---

# Round 7 additions — typography pass on the summary and the day list

## Changed (web)

| Element | Before | After |
|---|---|---|
| Summary eyebrow | 10px, weight 800, **all caps**, 0.12em tracking | 13px, weight 600, sentence case |
| Hero metric | `clamp(2.5rem, 8vw, 4rem)` (up to 64px), weight 900, glow/gradient | `clamp(1.875rem, 5vw, 2.25rem)` (30-36px), weight 700, no text-shadow; tabular figures come from the global rule |
| Stat chip labels | 11px, weight 800, all caps, 0.1em | 12px, weight 600, sentence case |
| "most spent on X" | 12px all caps on a red-tinted bar (read as an alert) | 14px sentence case on a neutral surface with a hairline border |
| Day-group labels | 11px all caps, 0.14em | 13px sentence case, weight 600 (14px desktop); inline utilities removed so CSS governs |

Verified by re-capturing the emulator-backed screenshots (390x844 and 1280x880, light and dark): the
record screen now reads as data rather than as chrome, and the day headers and group totals are
legible at a glance.

## Not done in this slice (queued, with the reason)

* **Android typography parity**: `summary_balance_period` is `.uppercase()`-ed in Compose, the hero
  is 52.sp, and `labelStyle()` (a shared all-caps style used across many screens) drives the small
  labels. Changing `labelStyle()` is an app-wide visual change, so it belongs in a slice of its own
  rather than being smuggled in with a single-card fix.
* **"FILTERS" sidebar heading** is still an all-caps label; it is part of the same family and will go
  with the shared style change.
* The dock still floats over content while scrolling. Checked, not a bug: `.app-shell__main` already
  reserves 10rem of bottom padding on mobile; content passing under a floating dock mid-scroll is the
  intended pattern here.

## Test evidence

```
web unit            41 files / 423 tests passed
tsc --noEmit        clean
lint:css            527 class tokens, no undefined utilities
vite build          ok
Playwright/Chromium 16/16 passed (full suite)
```
---

# Round 8 additions — Android typography parity (shared style + hero)

## Changed (Android)

| Element | Before | After |
|---|---|---|
| `SectionLabelStyle` (shared, 7 files) | 11sp Bold, 1.5sp tracking | 12sp SemiBold, 0.2sp tracking |
| Summary eyebrow | `summary_balance_period`.uppercase() | sentence case |
| Summary hero | 52sp Bold, gradient brush + 24px coloured shadow | 36sp SemiBold, solid tone colour, tabular, no glow |
| "most spent on X" | `.uppercase()` | sentence case |
| Dead code | `AuroraTokens.balanceBrush` + now-unused `Brush`/`Shadow`/`Offset` imports | removed |

The shared style is the small lever that reaches every screen: it keeps the size in the 12sp
territory and drops the wide tracking, which *reduces* text width, so nothing that fitted before
can start wrapping. Only the two labels whose case differed from the web build had `.uppercase()`
removed here.

## Deliberately not done: the other 12 uppercase call sites

**30 `.uppercase()` call sites remain across 9 UI files** (corrected count; the commit message
said 14 and undercounted): `BillsScreen` 9, `AddTransactionScreen` 5, `AuthScreen` 3,
`FinanceSummaryCard` 3 (labels other than the summary eyebrow), `IosSurfaces` 3,
`CategoryBudgetSection` 2, `OnboardingScreen` 2, `RecordScreen` 1, `components/Charts` 1.
That is the Insights/editor/auth visual pass, and it needs a screen-by-screen check on a device —
with no AVD in this environment I would be changing layouts I cannot look at. Recorded as the next
Android slice.

## Verification limitation, stated plainly

This Android slice is verified by **compilation, lint and the unit suite** (42 suites / 349 tests,
0 failures) — *not* visually. No Android screenshot exists for it: capturing one needs an AVD and the
seed script, which is the same gap the web rounds closed with Playwright. The Compose changes are
mechanical (one shared TextStyle, one Text, one removed helper) precisely because they cannot be
inspected here.
---

# Round 9 additions — Insights labels, and a hypothesis withdrawn

## H-4 withdrawn (evidence beats hypothesis)

I had recorded "charts have accessible names but the data is not exposed as text". Reading the label
construction shows that is false on both charts:

* `CashFlowChart.tsx:162` builds `ariaSummary` from the *totals* — `"cash flow chart. income: X. expense: Y."`
  — and puts it on `role="img"` (lines 208-209).
* `DonutChart.tsx:103-106` builds a summary of **every segment** with its rounded percentage, and
  lines 111-113 prepend the chart name and the centre total.

So Insights already gives screen-reader users the numbers, and there was nothing to fix. Recorded as
withdrawn rather than replaced with unrelated "improvements" to fill the slot.

## Changed: the remaining black-caps label family on Insights

The captured Insights screenshot showed the screen's dominant texture was all-caps tracked
micro-labels. Three classes carried it; all now match the sentence-case treatment used elsewhere
(12px, weight 600, 0.01em tracking):

| Class | Was | Now |
|---|---|---|
| `.insights-period-card__label` | 11px, w800, uppercase, 0.12em | 12px, w600, sentence case |
| `.insights-summary-dock__label` | 11px, w800, uppercase, 0.12em | 12px, w600, sentence case |
| `.insights-cashflow-card__label` | 10px, w800, uppercase, 0.12em | 12px, w600, sentence case |

`.insights-metric-card__stat-label` was already correct (12px, w600) and was left alone.

## What the Insights capture shows is still needed (next slice)

The hierarchy, not the type, is now the main weakness — and it is a product-shape change, so it is
stated rather than silently reordered:

1. **"Category budgets" occupies the largest card and sits first**, showing only "No category
   budgets configured", while the spending/income distributions are below the fold. The brief's
   intended narrative is overview -> change -> drivers -> distribution -> trend -> budget.
2. Nine cards of near-equal weight: no visual hierarchy between the period summary, the metrics,
   the shifts and the charts.
3. Section titles ("SPENDING PACE", "VS PREVIOUS MONTH", "TOP SHIFTS VS LAST MONTH", "EXPENSE",
   "INCOME") are still rendered by `AccentTitle`/card titles in caps; they need the same treatment,
   which means touching a shared title component across screens.

## Test evidence

```
web unit            41 files / 423 tests passed
tsc --noEmit        clean
lint:css            527 class tokens, no undefined utilities
vite build          ok
```