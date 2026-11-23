# Ausgegeben — UI/UX review (2026-11-23)

**Base:** `f34e2ad` · **Branch:** `audit/full-repository-2026-11`
**Method:** source review of every view/component, the theme cascade, and the existing
Playwright responsive suite; targeted fixes verified with unit/e2e checks. No manual
screen-reader session and no Android device/emulator pass were possible here — those are
listed as open verification, not claimed as done.

This document complements the historical register in `docs/ui-ux-audit.md` (Rounds 1–15).
Only current, re-verified state is asserted below.

---

## 1. What is already strong (re-verified)

- **Shell and navigation:** skip link → `#app-main`; `?tab=` URL is the source of truth for
  the web tab; Back/Forward re-read the URL; inactive tab panels are both `inert` and
  `aria-hidden`; desktop header nav and mobile dock expose identical labels.
- **Editor:** focus trap, body-scroll lock, dialog semantics, dirty-state discard prompt for
  both create and edit, field-level `aria-invalid`, dedicated error regions (updated in this
  pass), reduced-motion-aware scrolling, and an explicit load-failure state that blocks Save.
- **Financial presentation:** net cash flow is labelled (not "balance"), transfers are shown
  as a separate chip when non-zero so the net is explainable, and the currency settings sheet
  states that changing currency changes formatting only — historical amounts are preserved
  and not converted (`settingsCurrencyNotice`, en + de).
- **Responsive Record:** at ≥1440px the columns are summary → filters → list in DOM order, so
  reading, visual and Tab order agree; side columns stick only while they fit the viewport
  (`useFitsViewport`) and never scroll inside themselves.
- **Insights:** category cards split by a container query on the content column, long names
  clamp to two lines, and the card is not shown for historical months.
- **Loading:** `AppLoading` is used for the auth gate and lazy view/shell boundaries; the
  tab-level Suspense fallback keeps an `aria-busy` status rather than a blank panel.
- **Toasts:** the live region stays mounted; messages wrap to 32rem; on phones the action
  moves to its own line; the dock clearance is removed from 768px up.
- **Android:** Material 3 tokens, edge-to-edge with inset padding, `sp` typography, a 48dp
  minimum on colour/icon pickers with RadioButton semantics, `Role.Tab` navigation items,
  and a wide-window navigation rail that reuses the bottom bar's item and semantics.

---

## 2. Fixed in this pass

| Fix | Before | After | Verification |
|---|---|---|---|
| **Transfer-only day totals (web)** | `computeDayTotals` created a `{0,0}` bucket for a day whose only rows are transfers; Android omitted the day. | Transfers are skipped before bucketing; both clients produce the same map. A transfer-only day still renders its date header and its rows, with no totals. | `analytics.test.ts`, `financialParity.test.ts`, Android `FinancialParityTest` |
| **Transaction dialog error ids (web/a11y)** | Amount, category and form errors all used `id="add-txn-error"`. Only one renders today, but `aria-describedby` would resolve ambiguously as soon as two coexist. | `add-txn-amount-error`, `add-txn-category-error`, `add-txn-form-error`; each control describes its own region. | `e2e/addTransactionDiscard.spec.ts` asserts the amount input describes exactly one `#add-txn-amount-error` |
| **Android main tab restoration** | `selectedTab` was plain `remember`; rotation/process death returned every user to Record. | Persisted as a Bundle-safe key with `rememberSaveable`, restored through `mainTabFromStorageKey`. | New `NavigationTest` (JVM), Android unit-test task |
| **Stale test reference** | `recordGrouping.ts` pointed at a non-existent test file. | Points at `recordDayTotals.test.ts`. | source only |

### Explicitly re-checked brief targets

| Target | Verdict |
|---|---|
| "Empty day header on Web for transfer-only days" | **The totals divergence existed and is fixed.** The header itself is not empty on either platform — it carries the date and the rows — so the fix is the day-totals bucket, not a header suppression. |
| "Changing display currency must not imply conversion" | **Already handled.** The currency sheet carries an explicit notice in both languages; amounts are formatted, never converted. No change needed. |
| "`App.tsx` already uses `AppLoading`" | **Confirmed.** Auth gate and `Suspense` boundaries use the shared `AppLoading`; lazy `SignedInApp` also warms Firestore before resolving. No rewrite. |

---

## 3. Responsive review

The browser suite (`web/e2e/responsive.spec.ts`) is the automated contract. It covers:

- horizontal overflow at both sides of every breakpoint (767/768, 1023/1024, 1439/1440), in
  dark and light themes, on Record/Insights/Settings;
- the 320×568 short editor: CHF prefix, amount, category rail and note do not overlap, and
  Save stays in view;
- 60-row batch reveal with focus moved to the first newly shown row, plus search across the
  full history;
- pending-write status visible across tabs until acknowledged;
- a long toast at 320px: wraps, is not clipped, keeps its action reachable;
- onboarding steps are separate ≥24px targets with no overlapping hit areas;
- phone filters: visible type labels and 16px/44px amount and sort inputs;
- wide Record: column x-order, a 40-step Tab walk that never jumps back a column, and no
  nested scroll container;
- Insights card columns: one at a 1024px viewport, two at 1280px.

The hand-run sweep (`web/qa/responsive-audit.mjs`) extends this to 320/360/375/390/430,
tablets, laptops and 1440–2560 wide, landscape phones, and both themes. It requires a seeded
demo account and the dev server; it is not part of the automated run.

### Remaining visual risks

1. **Chromium-only evidence.** WebKit and Firefox were not run. The 16px no-zoom rule in
   `ios.css` is the one most worth a real iOS pass.
2. **Long German strings** are checked by the sweep for clipping at phone widths, but a
   manual visual review of every modal at large text sizes is still outstanding.
3. **Category editor and recurring editor** are not part of `responsive-audit.mjs`; their
   layout is covered by unit/logic tests and the 320px editor spec, not by the full sweep.
4. **CSS maintainability:** the cascade spans nine ordered files (`pages.css` is the largest).
   Round 15 removed one dead sticky block; further work should be per-component and
   screenshot-verified, not a global rewrite.
5. **Dark/OLED/theme palettes** are token-driven and the sweep re-runs two themes; the
   remaining named palettes (midnight, ocean, forest, sunset, lavender, soft_light) are not
   individually swept.

---

## 4. Accessibility review

**Fixed / strengthened in this pass**

- Distinct `aria-describedby` targets for all three transaction-error slots.
- Android main-tab state now survives recreation, so keyboard/switch users are not thrown
  back to the start of the app by a rotation.
- Corrected a source comment that implied a grouping test existed; the behaviour itself is
  covered by 23 pipeline tests.

**Re-verified as correct**

- Dialog/menu/listbox focus models: `useFocusTrap` traps Tab and handles Escape; the period
  selector moves focus into its listbox and restores it on Escape/Tab; the action-row menu is
  a portalled WAI-ARIA menu with roving focus and click/long-press/context-menu parity.
- Form labels: every input has a programmatic label; the category rail is a labelled group
  with `aria-pressed`; the amount field uses `inputMode="decimal"`; validation errors are
  `role="alert"`.
- Charts: the cash-flow plot is a labelled group with a keyboard hint, its point readout is a
  `role="status"` live region, and an exact-value table is available in a `<details>`.
- Touch targets: dock items, FAB, onboarding steps, icon buttons and 44px coarse-pointer
  inputs meet the documented minimums; the Android colour/icon pickers now expose ≥48dp
  selectable cells.

**Open**

- No manual VoiceOver/TalkBack/NVDA pass was run. The source-level semantics are strong, but
  announcement order and verbosity cannot be proven from code.
- Android's `rememberSaveable` fix is verified by a JVM key-mapping test; the Compose
  restoration itself needs an emulator/device (`StateRestorationTester` or rotation) to be
  observed.
- Settings checkboxes remain native inputs styled inside full-row labels; a switch role would
  match the rest of the UI but is a design decision, not a defect.

---

## 5. Android review

**Strengths kept**

- Adaptive navigation: bottom bar below 600dp, side rail at/above it; both share the same item,
  `Role.Tab`, labels and order, so the rail is not a second implementation.
- Insets: status bar, navigation bar and display cutout are padded on the rail, content and
  snackbar; the content column does not double-pad when the rail is present.
- Forms: amount keypad, locale-aware decimal separator, type/category reconciliation, dirty
  guard, load-failure blocking, and TalkBack labels on the note field, colour grid and icon
  grid.
- State/data: per-account ViewModel store clears on account switch; ViewModels survive
  configuration changes; Firestore disk cache is persistent and excluded from Android backup.

**Fixed**

- Main tab restored across recreation (see above).

**Open / needs a device**

- An open add/edit sheet still closes on rotation (draft is in the ViewModel; only the overlay
  stack is not saved). Filters/search also survive rotation via the ViewModel but not process
  death.
- TalkBack pass of the transaction note field, colour grid and rail; large-font layout at
  360dp and 200% font scale.
- Signed R8 release on an emulator, and instrumentation (`connectedProdDebugAndroidTest`),
  were not run in this environment.

---

## 6. Conclusion

The interface already meets the brief's structural requirements: responsive from 320px to
ultrawide, a coherent visual identity, visible labels on ambiguous controls, and a serious
focus/semantics model. This pass closed a real cross-platform display divergence and an
Android state-loss defect, tightened the editor's error wiring, and left the remaining
semantic question (budget spend vs. future-dated rows) documented rather than guessed at.
