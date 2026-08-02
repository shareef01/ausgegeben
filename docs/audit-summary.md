# Audit summary — 2026-08-02

Full-stack audit of Ausgegeben (web PWA + Android app + Firestore rules + CI/CD + live production). Every item below was verified against the real artifact, not just by reading code — per AGENTS.md section 1.

## Fixes shipped (deployed to production on 2026-08-02, user-approved)

| # | Finding | Fix | Verified how |
|---|---|---|---|
| 1 | **firestore.rules off-by-one**: `note.size() < 2000` and category `name.size() < 80` rejected exactly-at-cap values that both clients legitimately write (`slice(0,2000)` / `take(2000)`) — a 2000-char note or 80-char name failed to save with PERMISSION_DENIED after passing every client-side check | Rules bound changed to `<= 2000` / `<= 80`; 2 new boundary tests added | Rules suite 37/37 green (incl. new tests); rules compiled + released to production (`npm run deploy:rules`) |
| 2 | **Onboarding gate did not persist for unverified users**: `onboardingComplete` lived only in memory, and unverified accounts can't write preferences (rules), so every reload (and every sign-out → sign-in) re-showed the whole onboarding flow. Android didn't have this (DataStore); web did | Persist onboarding completion per-uid in localStorage (`ausgegeben-onboarding-complete:<uid>`), seed it on sign-in before the prefs snapshot; also fixed `App.tsx` resetting all preferences on the transient null user emitted during Auth init (reload). **Review-driven follow-up**: the first version of the seed called `completeOnboarding()`, which bumps `preferencesUpdatedAt` — for verified users the sync subscription then pushed default prefs over their real cloud doc on every reload. Fixed to `setState({ onboardingComplete: true })` (no clock bump → no push), with a 3-test regression suite (`preferencesStore.test.ts`) locking the invariant, and redeployed | Emulator harness audit-1: "Onboarding not re-shown after reload" + "Sign-in skips onboarding" PASS; clobber probe (sign in verified, set currency USD, reload → cloud doc still USD, onboarding skipped) 3/3 PASS; after redeploy, live smoke 10/10 + prod audit 11/11 PASS on aus01.web.app |
| 3 | **Release pipeline never launched the release APK** — CI only built + apksigner-verified it; the documented R8-strip crash class would still ship (AGENTS.md: "assembleProdRelease succeeding proves nothing") | `release.yml` now boots an API-29 emulator, installs the signed release APK, launches MainActivity, and fails the release if the process dies within 12s (logcat dumped on failure) | Workflow reviewed; change is CI-config (runs on next tagged release) |

## Verified working (no change needed)

- **Category reordering (the AGENTS.md "known open")** — device-verified on AVD against the emulator backend: arrows reorder, logcat stays free of `category_error_reorder_failed` / `PERMISSION_DENIED`, `sortOrder` writes land in Firestore. Stress-tested: hidden Uncategorized sentinel (sortOrder 999) present, duplicate sortOrders (renumbered sequentially), sortOrder gap (normalized). `CategoryReorderTest` 9/9. AGENTS.md section 3 updated.
- **Firestore rules** — writer-vs-rules matrix checked field-by-field for both clients: expense/category/preferences/meta payloads, legacy-field tolerance (cloudId/categoryCloudId/receiptImagePath/deleted, number-or-Timestamp updatedAt), category-exists + type-match enforcement, `accountDeletionPending` escape hatch is owner-scoped only (no mass-delete bypass).
- **Auth** — email verification enforced server-side on all mutations (mirrored client-side by both apps); account wipe = reauth → marker → batched wipe → auth delete; App Check initialized on both platforms and intentionally unenforced (harmless 403 + 24h throttle in headless, as documented).
- **Secrets** — HEAD tracks only `.example` files; git history contains an old scaffold `google-services.json` (dummy key) and a historical `web/.env.production` (public web-config values, embedded in every shipped client anyway) — hygiene note, no live credential leak; error-endpoint worker is origin-gated, size-capped, secret-free.
- **Dependencies** — web prod deps 0 known vulns; 7 moderate findings are dev-only (firebase-tools transitive, not shipped); `brace-expansion` override still justified; Android runtime tree clean.
- **Live production (unverified-only, per user decision)** — smoke 10/10; sign-in reaches the real backend; sign-up lands on real Auth; unverified writes correctly blocked with friendly error; account-wipe flow deletes the throwaway account; API-key referrer restriction active (blocks localhost).
- **Android on-device** — debug APK launches clean, sign-in, transaction write, settings/category flows all work against the emulator backend.

## Findings intentionally left as-is

- **Unverified-user preferences volatility** (web): everything except theme + onboarding is cloud-only until email verification — locale/currency/budget set pre-verification are lost on reload. Matches the documented "local-only theme/locale until confirm" design; noted, not changed.
- **Escape/backdrop on a pristine add-transaction sheet shows the discard-confirm** — category is always preselected so every pristine sheet counts as "has draft" (Android parity per code comment).
- **Two empty unverified throwaway accounts** (`prod-audit-*@test.local`) remain in production Auth from runs where cleanup couldn't run (no data; removable from the Firebase console).
- **Vite chunk warning**: firebase bundle 660 kB (>500 kB) — performance note, not a failure.
- **Android lint**: `POST_NOTIFICATIONS` not API-guarded at MainActivity.kt:133 (device run confirmed the permission flow works; @TargetApi guard could silence lint), `OldTargetApi` targetSdk 36 < compileSdk 37.
- **Git history hygiene**: the historical `web/.env.production` values could be rotated if strictness is wanted.

## Final gate results (all green)

- Web: unit 62 · lint · lint:css (454 tokens) · build · rules 37 · emulator repo 39
- Android: `./gradlew test` (78 tests) · lintProdDebug · assembleProdDebug · assembleProdRelease (R8, versionCode 10203)
- Emulator Playwright harness: 78 PASS / 0 FAIL (auth, transactions, record, categories, insights, settings, budget)
- Live: smoke 10/10 · prod audit 10/10 post-deploy
