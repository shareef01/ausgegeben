# Handoff for review — UI/UX audit & redesign branch

**Branch:** `ui/ux-audit-and-polish` (local, **not pushed**) · **Base:** `main` @ `89d2594`
**Tip:** `236fa37` · 15 commits · 42 files, **+2696 / −221**
**Reviewer:** independent review requested (Claude). Everything below is stated so it can be checked,
not believed.

This branch is independent of PR **#89** (`audit/restore-batch-budget`, data/recovery work) — no file
overlap in intent, and the two should land as separate PRs.

---

## 1. What the branch is for

An assignment brief asked for an evidence-based UI/UX audit of this repo and then implementation of
the confirmed defects plus a visual pass, with real test/lint/build evidence and no deployed changes.
Deliverables live in `docs/ui-ux-audit.md` (findings register, chronologically extended per round) and
`docs/ui-ux-design-spec.md` (design direction, tokens, component map, responsive rules).

**Read `docs/ui-ux-audit.md` first** — it carries the evidence for every claim here, including the
things I got wrong and withdrew.

## 2. Commit map (oldest → newest)

| Commit | Type | What |
|---|---|---|
| `a126fcd` | fix | **UX-1** web: edited transactions no longer discard silently; **UX-2** summary metric renamed |
| `ccc9731` | feat | **UX-3** honest day totals; **UX-4** tab history via `?tab=`; **UX-5** accessible period listbox |
| `60b5370` | fix | **UX-1** Android parity, plus **UX-7** (the ✕ bypassed the guard entirely) |
| `de876e5` | fix | **UX-3** Android parity |
| `7173629` | feat | **DW-1** mobile dock labels; **UX-6** auth `aria-invalid`; measured-layout e2e; regression fix: sign-out leaves `?tab=` behind |
| `16285af` | feat | transfers chip in the summary; day-label typography; **dock/FAB overlap fix found by screenshot** |
| `60ddc91` | style | typography pass: eyebrow, hero metric, chips, "most spent", day labels |
| `cc4c9c0` | style | Android typography parity (`SectionLabelStyle`, hero, two labels) |
| `18e88aa` | docs | corrected an undercount in a previous commit message (14 → **30** uppercase sites) |
| `0562c74` | style | Insights label family; **H-4 withdrawn** |
| `16684cf` | feat | Insights card order → the narrative the brief specifies |
| `8339f27` | style | Insights card titles read as headings |
| `ce0ecc7` | style | shared form label; **H-2 withdrawn** |
| `a943f5a` | style | Settings section headings; **capture-tooling false positive recorded** |
| `236fa37` | docs | recorded the full Android validation command + result |

## 3. Where to look hardest (my own risk ranking)

1. **`web/src/views/MainShell.tsx`** — the most behaviour-dense change on the branch: URL-as-tab,
   `pushState`/`popstate`, mount-time `replaceState`, session-reset via a `useRef` identity guard,
   focus-on-history-only. Two rounds of bugs came from here (duplicate-history and the signed-out
   `?tab=` leak). **Verify:** reload with a `?tab=` value while signed out; sign out on Settings then
   sign in as another account; Back/Forward across three tabs; a `?tab=` deep link with the app
   already authenticated.
2. **`web/src/components/PeriodSelector.tsx`** — hand-written WAI-ARIA listbox (roving tabindex,
   focus-on-open, Escape/Tab restoring focus). **Verify with a real screen reader**, not only the
   Playwright spec: the spec proves focus and keyboard, not announcement quality.
3. **`web/src/viewmodels/useAddTransactionViewModel.ts` + `AddTransactionView.tsx` (UX-1 web)** and
   **`util/TransactionDraft.kt` + `AddExpenseViewModel`/`AddTransactionScreen` (UX-1 Android)** —
   the dirty-check compares *normalised* values (cents, calendar day, trimmed note). **Verify:** the
   normalisation cannot make a real edit look clean (e.g. a sub-cent legacy amount, a timezone where
   the local day differs from UTC, a category that is unselectable). Persistence paths were not
   touched — confirm that by reading the diff, not the description.
4. **`web/src/viewmodels/useRecordViewModel.ts` + `utils/recordGrouping.ts` (UX-3 web)** and
   **`ExpenseViewModel.kt` (UX-3 Android)** — both derive day totals from the *same* filtered list as
   the rows. On Android the filter is applied twice (once for rows, once inside the `uiState`
   combine) rather than sharing a flow; that was a deliberate reversal, documented in the audit doc
   (sharing broke six existing tests). **Verify:** no second, divergent filter predicate crept in.
5. **`web/src/services/authService.ts`** — one added call, `resetTabParamForNewSession()`, which
   mutates `history` from a service. It is the only place that can reset the tab after the shell
   unmounts. **Verify:** no side effect on the account-deletion path, and no behaviour change when
   `window` is absent.

## 4. Claims to distrust first

* **Two of my four hypotheses were wrong** (H-2 "save reads as disabled", H-4 "charts expose no
  numbers"). Both are recorded as *withdrawn with evidence* in the audit doc. If you think either
  withdrawal is itself wrong, that is worth raising.
* **The a11y claims rest on Playwright + code reading, not on a screen reader.** No VoiceOver or
  TalkBack session has been run — say so in any review conclusion.
* **Android visual changes are NOT visually verified.** `SectionLabelStyle` and the summary hero were
  changed without seeing them (no AVD here). They are mechanically small, but they are unverified
  visually; the audit doc states this.
* **One "bug" I nearly filed was my own tooling** — Playwright `fullPage: true` composites
  `backdrop-filter` layers incorrectly in Chromium and produced a washed-out Settings screenshot.
  Capture the viewport only. The trap is documented.

## 5. Verification already performed (re-run freely, results should match)

```
web  (cd web)   npx vitest run          41 files / 423 tests passed
                npx tsc --noEmit        clean
                npm run lint:css        527 class tokens, no undefined utilities
                npm run build           ok (PWA, 45 precache entries)
                npx firebase emulators:exec --only auth,firestore \
                  --project demo-ausgegeben "npx playwright test"
                                        16/16 passed (7 spec files, real Chromium)
android (root)  ./gradlew testProdDebugUnitTest lintProdDebug assembleProdDebug
                                        BUILD SUCCESSFUL; 349 tests, 0 failures;
                                        app-prod-debug.apk 81,609,376 bytes
```

Not run, and not claimed: Playwright against production, `assembleProdRelease`/R8 (needs release
secrets), instrumentation, TalkBack/VoiceOver, Android screenshot capture.

**Environment notes for reproducing:** run the two emulator suites **one at a time** (the Firestore
emulator can be left holding port 8080 after a `WaitDelay` teardown; kill the orphaned `java` if a
suite fails without a `Tests` line). `web/.env.emulator` must exist for the e2e specs.

## 6. Deliberately out of scope

* No `firestore.rules`, auth-persistence, offline-cache or deletion-protocol change.
* No new dependency, no CSS framework, no chart library, no animation system.
* No deployment, no push, no PR opened for this branch.
* 30 `.uppercase()` call sites on Android and ~18 CSS rules still set caps. Some are legitimate
  status chrome; flipping them without looking at each screen is the failure mode this branch
  avoided. The per-file inventory is in §"Remaining all-caps inventory" of the audit doc.

## 7. Reviewer checklist (one line per claim)

- [ ] UX-1 web: editing a transaction and pressing Escape/backdrop/✕ prompts only when something changed.
- [ ] UX-1 Android: system Back **and** the top-bar ✕ both guard; a reformatted amount does not prompt.
- [ ] UX-2: the metric is labelled "net cash flow" / "netto im zeitraum" on both platforms; the formula is untouched.
- [ ] UX-3: with a search or type filter active, each day header equals the sum of the rows beneath it; the period summary does not change.
- [ ] UX-4: Back/Forward moves between tabs, re-clicking the active tab adds no history entry, reload keeps the tab, sign-out clears it.
- [ ] UX-5: keyboard-only operation of the period selector, with focus returning to the trigger.
- [ ] UX-6: a failed sign-in marks the field(s) with `aria-invalid`.
- [ ] DW-1: mobile dock labels visible at 320–430 px, nothing overlapping the FAB (asserted in `e2e/layout.spec.ts`).
- [ ] No behavioural change to saving, deleting, duplicating, restoring or deleting an account.
