# Android design QA — font scale, navigation mode, small phones

Date: 2026-10-29 · Scope: Android Compose UI (Record, Insights, Add transaction, Settings, bottom bar).
Companion to the web audit in [README.md](README.md).

## What was checked

Two instrumented test classes in `app/src/androidTest/java/com/aus/ausgegeben/ui/designqa/` run on the
`aus_api36` emulator (Android 16, 1080×2400 @ 420dpi):

- **`DesignQaMatrixTest`**: 48 cases, the real screen composables with real ViewModels over in-memory
  fakes. It covers Record, Insights, Add transaction and the Settings sections, each at:
  - font scale 1.0, 1.3 and 2.0, using Android's nonlinear scaling, as on a phone,
  - 320×640dp and 411dp wide,
  - German and English.
- **`NavigationModeLayoutTest`**: 8 cases. Record sits in the same scaffold as `MainActivity`, with the bottom bar
  (`MainBottomNavigation`, now shared by both) and the add button. It runs under gesture navigation and the
  3-button bar, at 320dp and 411dp, in German at 2.0 and English at 1.0. It switches the system navigation
  mode itself, runs only on an emulator, and puts gestures back afterwards.

Data: the "heavy" account from `web/scripts/seed-qa-data.mjs`, rebuilt in `DesignQaFixtures.kt`. It is in CHF,
uses the category name "Haushaltsversicherung und Nebenkosten der Wohnung" and nets
**1.104.064,70 CHF** this month (1.250.000,00 in, 145.935,30 out), with five earlier months.

Every page of every screen is scrolled through. On each page, all text on screen is checked for:

- an **ellipsised amount**,
- lines **cut off by `maxLines`**,
- text **wider or taller than its box**,
- text **pushed off the screen sideways** (outside horizontal scrollers),
- a **word split mid-word** (any amount, or a short word),
- two pieces of text in the same item **drawn over each other**.

Ellipsised category names (two lines, then "…") are allowed and listed as notes. Very long German compounds
that hyphenate at 2.0 are also notes. The navigation test also checks that:

- the tabs end above the system bar,
- the last transaction scrolls clear of the add button.

Run it all with:

```
./gradlew assembleProdDebug assembleProdDebugAndroidTest
scripts/run-android-design-qa.sh after
```

It writes `report.md` and screenshots (half size, WebP) to `docs/design-qa/android/<label>/`. Screenshots
cover German 320dp at 2.0 and English 411dp at 1.0 for each screen, plus the top and end of Record in each
navigation mode.

## Result

| Run | Matrix + navigation tests | Problems found |
| --- | --- | --- |
| before (`main` 4fb379b UI, same tests) | 22 / 56 pass | 234 reports, 61 distinct: 110 lines cut off, 88 split mid-word, 32 ellipsised amounts, 4 clipped sideways |
| after | **56 / 56 pass** | **0** |

By screen, before: Insights 119 reports (12/12 cases failing), Record 54 (8/12), Add transaction 47 (6/12),
Settings 14 (2/12). The six navigation-mode failures before were the same Record text problems; the inset
checks themselves passed in both modes.

## Findings and fixes

What a person saw, and what changed. Screenshot names are under `before/` and `after/`.

### Money amounts (all screens)

- **Amounts were ellipsised or clipped.** `MoneyText` and `AutoScalingText` ended in `TextOverflow.Ellipsis`,
  so the Insights stat cards showed "1.104.0…", the Record budget line showed "145.93…", and the averages
  row could not fit "1.104.064,70" at all. Both now shrink the amount to fit (to 60% for `MoneyText`) and
  then wrap. A wrapped amount breaks only after a group separator ("1.250. / 000,00"), never between two
  digits. Nothing is cut off.
- **Amounts broke mid-number.** The Record summary showed "1.250.00 / 0,00" and "145.935, / 30". The
  summary's net total and its earned/spent panes now shrink to fit.
- **`AutoScalingText` was rewritten.** The size is measured up front, so there is no shrinking flash, and it
  grows back when space returns. It is a plain `Layout` rather than `BoxWithConstraints`, because the
  summary card sizes its row with `IntrinsicSize`. A `BoxWithConstraints` version crashed Record, and these
  tests caught it.

### Insights

- **Three-column stat and averages rows.** They stay three columns while every amount fits a third at 11sp.
  Otherwise they stack into one full-width card per value, with the label above the amount. This is the
  same fix the web got for "1.104.064,70 CHF".
- **The donut's centre amount ran across the ring.** It is now held inside the hole and shrinks to fit.
- **Legend labels split mid-word** ("einge / nomm"). Each legend item now takes half the card, and the label
  and amount shrink to fit.
- **The spending-pace badge was one letter per line.** "Voraussichtlich 5.999,75 über Budget" was squeezed
  beside the card title. The title-and-badge headers (pace, comparison, averages, cash flow) now move the
  badge or legend under the title when both do not fit.
- **Category rows squeezed their names.** Beside a seven-digit amount the name was a few letters wide and
  "100%" split in two. The amount now drops under the name, using the same layout as Record rows.
- **Category-movers rows pushed the change badge off a 320dp screen.** The amounts and badge now sit under
  the name and wrap.
- **The empty category-budget card's text was a column a few letters wide** ("Kat / ego / rieb …"). The
  "Einrichten" button now sits under the text.

### Record

- **The period switch was crushed** to "die- / ser / mo- / nat" beside three 48dp buttons. It gets a line
  of its own when its labels cannot fit beside them.
- **Day headers with large day totals squeezed the date.** The totals now drop under the date.
- **The monthly budget line was ellipsised** ("145.93…"). It now wraps under its label.

### Add transaction

- **The amount being entered was clipped.** "1104064.70" showed as "11040" (`maxLines = 1` with no room to
  shrink). It now shrinks to fit and keeps every digit.
- **At 2.0 or on a short phone the keypad filled the screen.** The type, date, note and category form
  above it was squeezed to nothing. When the screen is shorter than 600dp or the text is larger than
  1.3, the form and keypad now scroll as one. Normal phones keep the pinned keypad.
- **The confirm button read "TRANSAKTION".** Its label was clipped at a fixed 56dp height; the button now
  grows and the label shrinks or wraps. Keypad keys grow with the text in the same way.
- **The type tabs clipped "Einnahme" to "einnahm".** Segmented-control labels now shrink, then wrap.
- **A long category name made one tile wider than the screen.** Tiles are now capped at 112dp, with the
  name on two hyphenated lines and then "…" (web parity).

### Settings and everywhere else

- **Words broke at any letter** ("kontaktiere / n"). The app typography and section labels now use
  automatic hyphenation (`Hyphens.Auto`), so a word that must break does so at a syllable, with a hyphen.

### Navigation modes and bottom bar

- **No defect found.** In both gesture and 3-button navigation, at both widths and both text sizes, the
  tabs sit above the system bar and the last transaction scrolls clear of the add button. The bar is
  icon-only with a fixed height, so the web's overlapping-label bug cannot happen here. Its column was
  moved out of `MainActivity` into `MainBottomNavigation` so the test exercises the real code.

## Left as is

- Category names are ellipsised after two lines in Insights rows and add-transaction tiles. The full name
  is still in the row, the chart legend and TalkBack.
- At 2.0 on a 320dp phone, half-width amounts such as the summary's "1.250.000,00" wrap at a group
  separator instead of fitting on one line. Every digit stays visible.
- The checks cover the screens above, not dialogs, sheets, onboarding or sign-in.
