# Ausgegeben — test results (2026-11-23)

**Base:** `f34e2ad` · **Branch:** `audit/full-repository-2026-11`
**Host:** Windows 11, JDK 21 (Microsoft), Node 24.16.0, npm 11.13.0, Chromium via Playwright,
Android emulator AVD `aus_api36` (API 36), Firebase Emulator Suite.
No production project was contacted and nothing was deployed or published.

---

## 1. Web (React / TypeScript)

| Command | Result |
|---|---|
| `npm test` (Vitest) | **64 files / 712 tests passed** |
| `npm run lint` (`tsc --noEmit`) | **passed** |
| `npm run lint:css` | **passed** — 602 class tokens |
| `npm run lint:hooks` (ESLint) | **passed** |
| `npm run lint:telemetry` | **passed** (TEL-1 guard) |
| `npm run build` (`tsc -b && vite build`) | **passed** — PWA `generateSW`, 51 precache entries; `firebase-firestore` 531.7 kB / 154.2 kB gzip |
| `npm run test:rules` | **4 files / 146 tests passed** (Phase 1; rules unchanged in Phase 2) |
| `npm run test:emulator` | **21 files / 190 tests passed** (Phase 1; cloud paths unchanged in Phase 2) |
| `npm run test:e2e` | **35 tests passed** (6.4 min) |

### Phase 2 regressions added/changed

| Suite | Cases | Verifies |
|---|---|---|
| `src/services/localCleanup.test.ts` | **13** | every step runs after another fails; each step can fail independently; blocked cache times out; marker write/removal failure; retry after partial failure; corrupt/unknown marker; no retry while another account is signed in |
| `src/services/authService.test.ts` | +1 (9 total) | journal/cache failure does not skip residual storage; `LocalCleanupError` is thrown after all steps; a durable pending marker remains |
| `src/utils/budgetSpendParity.test.ts` | **7** | shared `testdata/budget-spend-parity.json`: current/past/future month, midnight boundary, DST day, recurring rows, transfers, deleted rows, migrating/empty categories, and the no-cutoff legacy contract |
| `e2e/categoryBudgets.spec.ts` | +1 (2 total) | Record's actual + upcoming/anticipated line and Insights' anticipated/spent-so-far/upcoming split |
| `e2e/responsive.spec.ts` | rewritten matrix | one sign-in/context per matrix, geometry polling, 120 s budget for the keyboard/geometry work; no assertion removed |
| Phase 1 suites | unchanged | day-totals parity, transaction error ids, Android tab key mapping |

### E2E schedule and performance

The first Phase 2 full run produced **33 passed and two 30 s timeouts** in
`responsive.spec.ts` (wide Record and Insights columns). Both tests had reached their final
steps; the cause was repeated context/auth work plus a one-shot geometry read racing a lazy
render, not a product regression. The three matrix specs now reuse **one** context and
**one** sign-in, resize/emulate the colour scheme, and poll document geometry. Measurements
on the same host:

| Test | Before | After |
|---|---|---|
| breakpoint overflow matrix (12 contexts, 2 themes) | 1.3 min / 180 s budget | **23.9 s targeted, 39.3 s in full suite** |
| wide Record (2 viewports, 40 Tab steps each) | timed out at 30 s | **6.7 s targeted, 10.8 s in full suite** |
| Insights column split | timed out at 30 s | **6.3 s targeted, 6.2 s in full suite** |
| whole responsive spec (9 tests) | ~2.7 min, 2 failures | **1.3 min, 9/9 pass** |
| whole e2e suite | 8.6 min, 33/35 | **6.4 min, 35/35 pass** |

The remaining 120 s budgets cover two 40-step keyboard walks and several geometry reads on a
loaded emulator host; they are not the previous "make the flake disappear" change.

---

## 2. Android (Kotlin / Compose)

| Task | Result |
|---|---|
| `./gradlew :app:testProdDebugUnitTest :app:assembleProdDebug` | **BUILD SUCCESSFUL** |
| Unit tests (offline, emulator-dependent recovery tests skip) | **508 tests, 15 skipped, 0 failures** |
| `./gradlew :app:testProdDebugUnitTest --tests '*FirestoreEmulatorRecoveryTest*'` with Firestore+Auth emulators | **see Phase 2 recovery run below** |
| `./gradlew :app:lintProdDebug` | **passed** after the final Phase 2 UI edits |
| `./gradlew :app:connectedProdDebugAndroidTest` on `aus_api36` (API 36) | **68 tests, 0 failures, 0 errors, 0 skipped** (11m 5s) |
| `./gradlew :app:assembleProdRelease` (R8 + resource shrinking) | **BUILD SUCCESSFUL** (11m 34s), APK 7.1 MB |
| Release APK on API 36 emulator | installed, launched, `MainActivity` top-resumed, **no FATAL EXCEPTION**; force-stop/relaunch and rotation also clean |

### Phase 2 Android tests added

- `AddExpenseViewModelTest`: 5 restoration cases — new draft values/type/dirty, edited row
  with its original for a field-level patch, cross-account discard, reset clears the draft,
  stale edited id reports not-found without inserting twice.
- `ExpenseViewModelTest`: 4 filter cases — same-account restore of search/type/categories/
  amount bounds/sort/period, cross-account discard, a transient account-less ViewModel not
  erasing the saved state, and invalid stored values falling back.
- `FinancialParityTest`: 2 budget-spend cases — the shared cutoff fixture and the no-cutoff
  backward-compatibility contract.
- Phase 1 `NavigationTest` (3 cases) remains.

The offline full run skips 15 `FirestoreEmulatorRecoveryTest` cases via their documented JUnit
assumption when 127.0.0.1:8080/9099 are not both answering; the canonical runner starts the
emulators and fails if those tests skip. The Phase 2 run with emulators is recorded below.

---

## 3. Phase 2 recovery run (Android + Firestore/Auth emulators)

Command:

```
npx firebase emulators:exec --only firestore,auth --project demo-ausgegeben \
  "gradlew.bat :app:testProdDebugUnitTest --tests \"*FirestoreEmulatorRecoveryTest*\" --console=plain"
```

Result: **15 tests, 0 skipped, 0 failures, 0 errors** (76 s). The Windows runner needs
`gradlew.bat` because `emulators:exec` hands the command to `cmd.exe`; the POSIX
`scripts/run-firestore-recovery-tests.sh` remains the canonical cross-platform entry point.

---

## 4. What was not run (environment limitations)

| Check | Status |
|---|---|
| Manual TalkBack / VoiceOver / NVDA session | **Not run** — no screen-reader session was available. |
| Signed-in editor rotation UI test on Android | **Not run** — the Activity recreation instrumentation test passes, and the view-model restore is unit-tested, but no automated signed-in Firebase journey rotates an open editor. |
| WebKit and Firefox Playwright projects | **Not configured** — Chromium only; phone widths are emulated in Chromium. |
| `qa/responsive-audit.mjs` seeded sweep | **Not run in this pass** — requires a seeded demo account and dev server; its automated subset (`e2e/responsive.spec.ts`) passes. |
| Production deployment / smoke | **Intentionally not run**. |
| Publishing the R8 APK | **Not run** — the local build uses the throwaway `CN=Test` certificate and must not be distributed. |
| Real-device instrumentation | **Not run** — emulator AVD only. |

---

## 5. Regression coverage impacted by Phase 2

| Behaviour | Covered by |
|---|---|
| Web cleanup per-step failure/retry | `localCleanup.test.ts` (13), `authService.test.ts` (failure injection) |
| Budget actual/upcoming/anticipated parity | `budget-spend-parity.json` + `budgetSpendParity.test.ts` + Android `FinancialParityTest` |
| Budget UI disclosure | `e2e/categoryBudgets.spec.ts` |
| Android filter restore | `ExpenseViewModelTest` (3 new) |
| Android editor restore / no double submit / stale id | `AddExpenseViewModelTest` (5 new) + `MainActivityLaunchTest` recreation |
| Responsive matrix | `e2e/responsive.spec.ts` (optimized, 9/9) |
| All Phase 1 behaviour | existing 712 web unit, 190 web emulator, 146 rules, 508 Android JVM (15 skipped offline), 68 instrumentation |

---

## 6. Outstanding blockers

1. **Manual screen-reader pass** and a signed-in editor rotation UI journey.
2. **WebKit/Firefox** browser evidence.
3. **Real-device instrumentation** (the emulator is the only Android device exercised).
4. **Product decision:** whether the category-budget warning state should use anticipated
   (current) or actual spending. The UI now labels both; the primary metric was deliberately
   not changed.
