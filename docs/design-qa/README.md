# Precision UI/UX polish — audit, batch 1–2 (web)

Date: 2026-10-29 · Scope: web app only · Not deployed.

Status words: **implemented** = code changed; **verified** = checked in a real browser (headless
Chromium via `web/qa/capture.mjs`) and/or the unit suite; **blocked** = could not be checked here.

## How the evidence was produced

The Firebase emulators would not start on this machine (the Firestore emulator's Java process
fails with `Unable to establish loopback connection` — an AF_UNIX loopback socket issue — with and
without the sandbox and with a custom `jdk.net.unixdomain.tmpdir`). So the full app and the
Playwright e2e suite could not run.

Instead, `web/qa/harness.html` renders the **real** components (`TransactionRow`, `ActionRow`,
`PremiumPeriodSelector`, `CashFlowChart`, `CategoryCard`/`DonutChart`, `FinanceSummaryCard`,
`BudgetProgressBar`) with fixture data. Category tiles are the one exception: the harness
repeats `AddTransactionView`'s tile markup, so the tile checks test the CSS, not the view.
`web/qa/capture.mjs` takes screenshots and runs scripted checks. The same harness was served
from a checkout of `main` (1e54761) to produce `before/`, and from the working tree for `after/`.

```
cd web && npx vite --port 5173
node qa/capture.mjs after http://127.0.0.1:5173
```

| Run | Checks passed |
| --- | --- |
| before (`main`) | **40 / 59** (some checks cannot run on `main`, e.g. there is no tooltip to measure without keyboard access) |
| after | **66 / 66** |

Datasets: *typical* (5 rows, short English names), *heavy* (German/CHF, names such as
"Haushaltsversicherung und Nebenkosten der Wohnung", similar prefixes "Lebensmittel – …",
amounts 0.00 → 1,234,567.89), *edge* (single all-zero period). `web/scripts/seed-qa-data.mjs`
seeds equivalent emulator accounts for when the emulator works.

## 1. Verified baseline (left alone)

Checked in code; behaviour unchanged by this work. The e2e specs that cover these could not
be re-run (emulator).

- [x] Collapsible advanced filters on mobile — `record-filters__advanced` + `e2e/recordFiltersMobile.spec.ts`
- [x] Period-wide vs filtered totals — `FinanceSummaryCard` uses `summaryExpenses`
- [x] Mobile nav labels / desktop nav — `bottom-nav-pill__label`
- [x] URL navigation and history — `e2e/tabHistory.spec.ts`
- [x] Dialog focus trapping — `useFocusTrap`
- [x] Unsaved-change confirmation — `e2e/addTransactionDiscard.spec.ts`
- [x] Queued vs confirmed save feedback — `transactionQueued*` vs `transactionSaved` toasts
- [x] 44px touch-target floors, reduced-motion rules, "Other" aggregation, chart summaries

## 2. Changelog by screen

### Record — transaction rows (`SwipeableRow` → `ActionRow`)  · implemented, verified
- The row surface is a `role="button"` (was `role="group"`): Enter/Space/click edit; Delete
  still deletes (undo toast).
- One always-visible 44px "more" button per row opens a WAI-ARIA menu: edit, duplicate, then a
  separator and delete in the danger colour. Arrow keys, Home/End, Escape (focus returns to the
  button), Tab, outside press, scroll and resize all close it correctly. The menu flips above the
  button near the bottom nav and stays inside the viewport at 320px.
- Long press, right-click and the context-menu key now **open the menu**. Long press used to
  **duplicate immediately with no confirmation**, and on touch it was the only way to duplicate.
- Activation uses `click`, so a scroll that starts on a row never opens it (checked with CDP touch
  events). The old `pointercancel` path could run the tap handler.
- Desktop rows no longer move 132px sideways on hover to make room for the buttons.
- At 320px a 6–7-digit amount used to squeeze the category name to zero width. On `main` it also
  hid "+1.234.567,89 CH**F**" under the delete button. Now the name keeps a 3.5rem minimum and
  the amount wraps under it, right-aligned. See `before|after/rows-heavy-320-touch.png`.
- Zero amounts show no sign ("0,00 CHF", was "-0,00 CHF"), on screen and in the spoken label.
- The component was renamed because it never swiped.

### Record — period selector  · implemented, verified
- It was already a correct listbox popup (focus moves into the list, roving tabindex, Home/End,
  Escape, Tab, `aria-selected`), and `e2e/periodSelector.spec.ts` still holds. One fix: outside
  dismissal listened for `mousedown`, which touch browsers synthesise late or not at all. It now
  uses `pointerdown`. Long German month labels ellipsise inside the trigger (`period-open-320-de.png`).

### Add transaction — category tiles  · implemented, verified (CSS)
- Selection used the **income green** even for expenses. It now uses the theme accent plus a
  check badge, so selection never depends on colour alone.
- **Light-theme bug fixed:** a later `[data-theme='light'] .add-txn__cat` rule outranked the
  selected state, so in every light palette the selected tile had the same border and fill as
  the others. On `main` the selected border was `rgb(212,212,216)` on white; now it is the accent.
  See `cats-heavy-320-light.png` and `-lavender.png`.
- Names are shown as typed ("IKEA", not "ikea"). They get two lines with word breaks and
  hyphenation, plus a `title`, instead of one line of "lebensmitt…" for every "Lebensmittel – …".
- Auto-scroll to the selected tile respects `prefers-reduced-motion`.

### Insights — cash-flow chart  · implemented, verified
- The chart is drawn at its measured pixel width. Before, it scaled a 400-wide viewBox: at 320px
  the card **scrolled sideways**, the latest month could not be reached by pointer, and labels
  shrank to about 8px.
- Axis labels use locale-correct compact currency on rounded ("nice") ticks:
  "2 Mio. CHF · 1 Mio. CHF · 0 CHF" and "€5K · €2.5K · €0". Before, they read
  "1.5M · 747k · 0,00" (English abbreviations with German decimals and no currency), and an
  all-zero period read "1.20 · 0.60 · 0.00". German thousands use "Tsd.", because Intl's German
  compact format prints "123.456,8 €" in full.
- Month labels are spaced by their length, so long names no longer overprint each other.
- Keyboard: the plot is a focusable group with a spoken hint. ←/→/Home/End step through
  periods, the readout is a live region, and Escape clears it. On touch, the readout stays after
  the finger lifts, and horizontal drags explore while vertical drags still scroll.
- The tooltip is clamped in pixels by its measured width, so it stays on screen at both edges at
  320px with long CHF amounts.
- "Show values as a table" lists exact income, expense and net per period. Below 420px it stacks
  into label/value pairs instead of scrolling sideways.

### Insights — category donut and list  · implemented, verified
- **Theme-switch bug fixed:** segment colours and the "Other" swatch were memoised without the
  theme. After a live dark→light switch the donut kept dark-palette colours (`#ea6553`) until
  reload. `applyTheme` now bumps a revision that `useThemeRevision()` subscribes to, and the
  colours after a switch match a fresh light load (`#d93c26`). See `donut-dark-then-light.png`.
- **Truncated total fixed:** the centre total was sized with `2.8vw`, so on desktop it grew while
  the 148px hole did not, and "2.717,89 CHF" showed as "2.717,89 C…". It is now sized from the
  donut size and the string length.

## 3. Accessibility findings

| Finding | Status |
| --- | --- |
| Duplicate only by long press on touch; long press acted immediately | implemented, verified |
| Android: long press on a Record row duplicated at once, with no visible duplicate control | fixed in #108: a 48dp more button opens Edit, Duplicate, Delete; long press opens the same menu |
| Row exposed as `group`; actions only appeared on hover/focus | implemented, verified |
| Chart values unreachable without a pointer | implemented, verified |
| Selected category conveyed by colour only (and invisible in light themes) | implemented, verified |
| Period popup stays open after an outside tap on touch | implemented, verified |
| Menu focus ring shown after a touch open | implemented, verified (focus goes to the menu, not item 1) |
| After deleting from the menu, focus falls to `<body>` (the row is gone) | open — low |

## 4. Unresolved issues

| Severity | Issue |
| --- | --- |
| — | ~~Blocked: e2e suite not run~~ — resolved: CI ran all 23 e2e tests on PR #107, including `recordRowActions.spec.ts`; all passed. |
| — | ~~Batch 3 not started~~ — done; see section 6. |
| Medium | 52 `!important` declarations remain, mostly the `premium.css` "master override" fighting earlier files (section 6). Untangling them changes specificity everywhere and needs its own pass. |
| Low | Category tiles clamp at two lines, so "Lebensmittel – Wochenmarkt" can show as "Lebensmittel –…" (the full name is in the tooltip and accessible name). |
| Low | The chart tooltip sits over the top tick label while open (same as before). |
| Low | The QA matrix covered the harness sizes and themes listed above, not screens that need live data (Settings, onboarding, offline/pending states, the 200% text-scale pass). |

## 6. Batch 3 — controlled CSS cleanup (web)

Checked against the **real app**: the emulator now starts, using the workaround of a real
`TEMP` plus `-Djdk.net.unixdomain.tmpdir` outside Temp. Seed with `scripts/seed-demo-data.mjs`
and `scripts/seed-qa-data.mjs`.

**Inventory** (`node web/scripts/css-inventory.mjs`). The stylesheets cascade in this order:
global → recurring → layout → pages → brand → oled → polish → ios → premium → index. Across them:

- 50 provably dead declarations: 48 exact repeats, and 2 already beaten by an
  identical-selector `!important`.
- Only 4 cases where the same selector is overridden in a later file. Almost all
  overriding happens through *different* selectors, so it can't be merged mechanically.
- 52 `!important` declarations, in these groups:

| Group | Where | Why it exists |
| --- | --- | --- |
| Reduced motion | global, pages, polish | must beat every component animation; correct as is |
| Scroll lock and body | ios.css (`body`, `body.is-scroll-locked`) | an inline style can't beat these, so `useBodyScrollLock` uses a class (documented in the hook) |
| Safe-area overlay padding | ios.css `.safe-overlay` | beats the per-dialog padding |
| Record list "master override" | premium.css (`.transaction-row`, `.transaction-list-bare__rows`, …) | restyles earlier pages.css rules; `ActionRow` needed its own `!important` (pages.css:560) to win back the right padding |
| Insights card padding/radius | pages.css `.insights-*-card` | beats the generic `.card` padding |
| Light-theme shadows | polish.css `[data-theme='light'] …` | beats the dark-theme glow shadows |
| Utility escapes | layout.css `.!p-0`, `.!text-5xl` | intentional "important" utilities |

**Removed** (commit "remove 50 overridden CSS declarations"). A declaration was removed only
when a later rule with the *identical* selector and *identical* @media/@supports context sets the
same property with at least the same importance. That later rule wins for every element and
state either way. Fallback pairs (`100vh` before `100dvh`, `env()`, `color-mix`) were kept.

**Proof** (`web/qa/style-snapshot.mjs`). The script records every element's full computed style,
including `::before`/`::after`, across 98 states:

- two accounts: en/EUR, and de/CHF with 306 rows
- 375 and 1440 wide
- dark, light, midnight and lavender themes
- Record (plus row menu and period popup), Insights, Settings, the edit sheet, and signed out

A control run on unchanged CSS was **identical**. That required sorting properties, because
Chrome reports custom properties in an unstable order. After the cleanup, all **104,310 element
styles are identical**. lightningcss reports all ten files valid.

**Scroll lock** (`web/qa/scroll-lock.mjs`). With the list scrolled 1200px and the edit sheet open,
the page neither jumps nor scrolls behind the sheet, and its position is restored on close.
This passed in Chromium (Android Chrome's engine) and WebKit (Safari's). It was not run on a
physical iPhone.

**Responsive fix found by the sweep** (`web/qa/overflow.mjs`, separate commit). On every phone
width, Insights for the German/CHF account was 446px wide. The all-time-averages card used three
`1fr` columns, which can't shrink below "1.104.064,70 CHF". The page scrolled sideways and, on a
real phone, the zoom-out pushed the fixed bottom nav **off-screen**. At 320px the cash-flow
legend also overflowed. The stat rows now wrap by content and the card header wraps. The sweep
now shows no overflow on Record, Insights or Settings at 320/375/390/430 for either account
(`css/before|after-overflow-heavy-375-insights.png`).

## 5. Files

`before/` and `after/` hold matching screenshots: `all-<theme>-<w>x<h>.png` for all seven QA
sizes in dark and light, plus targeted shots for rows, the menu, the period popup, tiles, chart
tooltip and table, and the donut theme switch.
