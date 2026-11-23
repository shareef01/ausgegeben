# Ausgegeben — test results (2026-11-23)

**Base:** `f34e2ad` · **Branch:** `audit/full-repository-2026-11`
**Host:** Windows 11, JDK 21 (Microsoft), Node 24.16.0, npm 11.13.0, Chromium via Playwright.
Firebase Emulator Suite and `firebase-tools` were available locally; no production project
was contacted.

---

## 1. Web (React / TypeScript)

| Command | Result |
|---|---|
| `npm test` (Vitest) | **62 files / 691 tests passed** (rerun after changes: same) |
| `npm run lint` (`tsc --noEmit`) | **passed** |
| `npm run lint:css` | **passed** — 600 class tokens, no undefined utilities |
| `npm run lint:hooks` (ESLint) | **passed** |
| `npm run lint:telemetry` | **passed** (TEL-1 guard) |
| `npm run build` (`tsc -b && vite build`) | **passed** — PWA `generateSW`, 51 precache entries; largest chunks: `firebase-firestore` 531.7 kB / 154.2 kB gzip, `react-vendor` 218.8 kB / 68.3 kB gzip |
| `npm run test:rules` | **4 files / 146 tests passed** |
| `npm run test:emulator` | **21 files / 190 tests passed** |
| `npm run test:e2e` | **34 tests passed** (8.5 min) |

### Targeted regressions added/changed

| Suite | Case | Verifies |
|---|---|---|
| `src/utils/analytics.test.ts` | `computeDayTotals ignores transfers, including a transfer-only day` | A transfer-only day produces no key; the map contains only the day with income/expense |
| `src/utils/financialParity.test.ts` | day-totals parity | The fixture's transfer-only day is absent on web and no `{0,0}` entries exist |
| `e2e/addTransactionDiscard.spec.ts` | amount validation | The amount input describes `#add-txn-amount-error` and exactly one such node exists |
| `src/viewmodels/recordDayTotals.test.ts` | existing 23 cases | Day totals still follow filters, sorting, midnight and DST edges |

### E2E scheduling note

The first full run produced **32 passed and 2 timeouts**:

- `addTransactionDiscard.spec.ts` reached its final assertion with the right value but exceeded
  the default 30 s;
- `responsive.spec.ts` › breakpoint overflow sweep completed its checks and timed out at
  `context.close()` inside its own 60 s cap (12 fresh contexts × emulator sign-in).

Both were re-run individually with larger budgets and passed; the per-spec budgets were then
raised in the repository (120 s for the long transaction journey, 180 s for the 12-context
breakpoint sweep) with comments explaining the round-trip count. The subsequent full suite
passed **34/34**. No assertion was weakened.

---

## 2. Android (Kotlin / Compose)

| Task | Result |
|---|---|
| `./gradlew :app:testProdDebugUnitTest :app:assembleProdDebug` | **BUILD SUCCESSFUL** (5m 45s baseline; 5m 17s after changes) |
| `./gradlew :app:testProdDebugUnitTest --tests '*FinancialParityTest*'` | **passed** |
| `./gradlew :app:testProdDebugUnitTest --tests '*NavigationTest*'` | **passed** (new suite) |
| `./gradlew :app:lintProdDebug` | **BUILD SUCCESSFUL** (8m 18s) |

New JVM test: `app/src/test/java/com/aus/ausgegeben/ui/NavigationTest.kt`

- every entry in `MainTabRoutes` round-trips through `storageKey` / `mainTabFromStorageKey`;
- keys are stable and distinct;
- `null`, empty, unknown and overlay keys fall back to the Record tab.

The unit-test task does not include Compose runtime rendering, so the `rememberSaveable`
restoration itself is not executed here; it is covered at the mapping level and by the
compile/lint gates. Instrumentation is listed below as an environmental blocker.

---

## 3. What was not run (environment limitations)

| Check | Status |
|---|---|
| Android instrumentation (`connectedProdDebugAndroidTest`) | **Not run** — requires a running AVD/device and an unlocked display; none was started in this environment. |
| Signed `assembleProdRelease` with R8 | **Not run** — a local release build would use the throwaway `CN=Test` certificate and must not be distributed; the release workflow owns the real signing gate. Debug compilation, unit tests and lint pass. |
| Android device/emulator screenshots | **Not run** — same AVD requirement. The UI review therefore cites source and the web spec, and marks device-only items open. |
| Manual TalkBack / VoiceOver / NVDA pass | **Not run** — no screen reader session was available. |
| WebKit and Firefox Playwright projects | **Not configured** — the repo runs Chromium only; phone widths are emulated inside Chromium. |
| `qa/responsive-audit.mjs` seeded sweep | **Not run in this pass** — requires a seeded demo account plus the dev server; its automated subset is in `e2e/responsive.spec.ts`, which passed. |
| Production deploy / smoke | **Intentionally not run** — the brief forbids production deployment, billing changes and user-data mutation. |

---

## 4. Regression coverage impacted by this change

| Behaviour | Covered by |
|---|---|
| Transfer-only day totals on web | `analytics.test.ts`, `financialParity.test.ts` |
| Cross-platform day-total contract | `testdata/financial-parity.json` + `FinancialParityTest.kt` + `financialParity.test.ts` |
| Android tab key mapping | `NavigationTest.kt` |
| Transaction editor described-by wiring | `e2e/addTransactionDiscard.spec.ts` |
| Record list/day grouping | existing `recordDayTotals.test.ts` (23 cases) |
| All other financial, sync, restore and rule behaviour | existing 690/691 web unit tests, 190 emulator tests, 146 rules tests (unchanged and green) |

---

## 5. Outstanding blockers

1. **No device/emulator run**: Android Compose restoration, TalkBack order, 360dp large-font
   layout and instrumentation cannot be claimed as observed. They are code-reviewed and
   compile/lint-clean only.
2. **No R8 release artifact**: debug only. R8 can change behaviour in ways unit tests do not
   catch; the release workflow remains the authority.
3. **Chromium-only browser evidence**.
4. **F-05 semantic question** (budget spend vs. future-dated rows) is documented but not
   changed; it needs a product decision before a parity-safe implementation.
