# Notes for agents working on Ausgegeben

Read this before auditing, refactoring, or "fixing" anything here. Several things
that look like defects are deliberate, and several things that look fine are not.

---

## 1. The most important thing

**Every real bug this project has had was invisible to CI, unit tests, and code
review.** Each one was found by running the real artifact against the real
backend. Green CI has never once predicted correctness here.

| Bug | Why nothing caught it |
|---|---|
| R8 stripped Room's generated constructors → **every release APK crashed on launch** | Debug builds don't run R8; CI built the release but never launched it |
| One rules-rejected document aborted a whole 450-doc batch, stranding healthy rows | Needs real rules + real data; mocks pass |
| Legacy `Timestamp` `updatedAt` made **44% of a user's rows permanently uneditable** | Only visible by reading actual documents, not the schema |
| Web API key silently deleted → **sign-in broken for everyone** | Deploys keep succeeding; nothing validated the key |
| Soft-deleted rows still counted as live, **inflating totals by €7,655** | Nothing read the `deleted` flag; the data looked fine |
| Category reorder swapped against a hidden row and against duplicate values | Logic was inline behind Firestore, unreachable by tests |
| "Category reordering — device-verified as working" (this file, 2026-08-02 morning) was itself wrong — still broken for a real account that afternoon | AVD test data carries none of the legacy `cloudId` / Timestamp `updatedAt` / `deleted` field drift a real, long-lived account has; a device test only catches what the test account's data shape can trigger |
| The **fix** for that soft-delete row above (2026-08-06) left the month total still counting deleted rows, and shipped an irreversible mass-delete that could never run | The cleanup was gated on `meta/dedupe.orphansScannedAt` being unset — already set on every account that has cold-started. 65 unit + 39 emulator tests passed because not one fixture seeds a `deleted` row |
| `sum()` in `sumMonthExpenses` had been **failing in production the whole time** for want of an index including the *aggregated* field — the web budget warning was silently dead (2026-08-06) | An aggregation needs `amount` in the composite index, not just the filtered fields. The emulator invents indexes on demand so 44 emulator tests passed; `gcloud … indexes list` said `READY` because a *different* index had built; and both clients wrap the projection best-effort, so the only trace anywhere was one `W` line in logcat |

**Therefore:**

- Install the **signed release** APK on a device and launch it before calling a
  release good. `assembleProdRelease` succeeding proves nothing.
- **Read the actual documents** before reasoning about the schema. Field *types*
  drift (numbers become Timestamps), not just field names.
- Drive **production** with a throwaway account after deploying. `npm run smoke`
  does the non-interactive half automatically.
- When you assert something works, say how you checked. "The code looks right" is
  not a check.

---

## 2. Deliberate decisions — do not "fix" these

**Firebase Spark plan, no billing.** No Cloud Functions. The error-reporting
endpoint is a Cloudflare Worker in `tools/error-endpoint/` for this reason. Any
proposal requiring Blaze is out of scope unless the user reopens that decision.
Spark also caps reads at 50k/day, which is why full-collection scans sit behind
one-shot markers (`meta/dedupe.orphansScannedAt`) and a 30s cache.

**App Check is UNENFORCED project-wide, on purpose.** Play Integrity cannot
attest a sideloaded APK, and enforcement is **per-service, not per-platform**, so
enabling it would break both the GitHub-distributed Android app *and* the web
app. The Firestore rules are the actual security boundary and they are strong.
The web client still initialises App Check and logs a harmless 403 — that is
known, not a bug to chase.

**Distribution is GitHub Releases, not Google Play.** `git tag v1.2.3` triggers
`.github/workflows/release.yml`. `versionCode` derives from the tag (`v1.2.3` →
`10203`) because it was once hardcoded to `1`, which would have made the second
release uninstallable over the first.

**Legacy fields are tolerated, never written — on both expenses and categories.**
`validExpense()` allows `cloudId`, `categoryCloudId`, `receiptImagePath`,
`deleted`; `validCategory()` allows `cloudId`, `deleted`. Both bound the fields by
type and size, and both accept `updatedAt` as **number or Timestamp**.
Tightening any of this re-freezes real rows written by older builds — categories
got this later than expenses (see section 1's reorder incident) and needed it
just as much: 12 of 17 categories on the account that surfaced it carried
`cloudId` with a Timestamp `updatedAt`. Three expense documents exist with no
core fields at all; they are inert and intentionally left.

**Web `.btn` has no padding of its own.** Sizing comes from utility classes at each
call site. The 44px touch floor lives in a `@media (pointer: coarse)` block in
`ios.css` — a mouse deliberately keeps the compact desktop sizing. Do not move it
to an unconditional rule, and do not add `padding` to `.btn` (pages.css loads
after layout.css and would override callers' utilities).

**The Android numpad keys are deliberately bare** — no fill, border, or shine.
Twelve chrome tiles made the pad the loudest thing on the sheet and each ran its
own endless animation.

**The all-time scan cache is a rate limit, not a staleness policy.** Every local
write clears it before the change event fires; the 30s window only ever hides an
edit made on another device, which that path never observed anyway.

---

## 3. Known open

**An aggregation's composite index must include the aggregated field.**
`sumMonthExpenses` sums `amount`, so it needs `(transactionType, dateMillis,
amount)`, and the deleted-subset pass needs `(transactionType, deleted,
dateMillis, amount)`. The filtered fields alone are not enough. Both were deployed
and **confirmed serving on 2026-08-06** by adding a real expense on a real device
with a budget set, seeing the projection fire, and reading an empty logcat.

Three separate signals said "fine" while this was broken, so trust none of them
alone: the emulator invents indexes on demand (44/44 green), `gcloud firestore
indexes composite list` reported `READY` — for a *different* index that had built
correctly — and both clients wrap the projection best-effort (`runCatching {
checkBudgetAlert(...) }` at `AddExpenseViewModel.kt:170`, `try/catch` at
`useAddTransactionViewModel.ts:168`) so a failed projection cannot look like a
failed save. The failure mode is therefore **silent**: saving keeps working, the
budget warning simply never appears, and the only trace anywhere is a single
`budget check failed` line in logcat or the browser console.

The only check worth anything here is adding an expense on a device with a budget
set and reading logcat. Deploy indexes before the code that needs them
(`npm run deploy:rules` covers indexes as well as rules).

Also unproven on that change: `assembleProdRelease` (R8) never ran for it.
**Correction 2026-08-27:** signing material now exists on this machine
(`keystore.properties` + `ausgegeben-release.jks`, both gitignored) — the
earlier claim that no signed release could be built here is obsolete. A signed
release built at ≈HEAD passes R8 (`minifyProdReleaseWithR8` ran, 5m),
apksigner verifies the cert, the `-P` versionCode/versionName overrides are
honored, and mapping.txt keeps Room's `_Impl` constructors. Still true from the
original warning: a plain `assembleProdRelease` with no `-P` produces
versionCode 1 (§4 gotcha unchanged), and R8 passing is a *build* gate only —
launch evidence must come separately, from a device run. **Update same day:**
v2.0.0 shipped from this state — CI's emulator launch gate passed on the signed
APK, and the user installed it on their real phone (replacing a debug sideload)
and signed in.

A **prod debug** APK was sideloaded to the Pixel 7 on 2026-08-06 and launched
clean (process alive, empty crash buffer, only the documented App Check 403). That
is a launch check and nothing more: the uninstall it required wiped local data, so
the app was signed out and **no signed-in path — including the month total this
change exists to fix — has been exercised on a device.**

**Category reordering — actually fixed 2026-08-02, verified against a real
account with real data, not just the AVD.** The entry that used to live here
("device-verified as working," written that same morning) was itself premature
— see section 1's incident table. Three separate bugs, found in this order by
testing against a real account rather than the AVD:

- A genuine concurrency race: `moveCategory` read the category list fresh and
  wrote it sequentially on every tap, so two rapid taps could interleave and
  reintroduce duplicate `sortOrder` values through overlapping writes — the same
  end state PR #16 fixed, via a new mechanism. Fixed with a busy-guard and a
  single atomic batch write (`updateCategoriesBatch`).
- A regression in that fix: switching the read to a cached `StateFlow` saved a
  listener, but the cache is only warm on the Settings > Categories screen, not
  the manage-categories sheet opened from Add Transaction — reordering from
  there silently computed against stale-or-empty data and wrote nothing.
- The actual blocker: `validCategory()` didn't tolerate the legacy fields real
  category documents carry (see section 2) — any write to one of those rows,
  including a plain `sortOrder` rename, was rejected outright.

Covered by `CategoryViewModelTest` (busy-guard + batch write) and a
`firestore.rules.test.ts` case built from the real account's field shape, not a
guessed fixture. Confirmed working by the user on the real device afterward.

---

## 4. Environment gotchas that will waste your time

- **`JAVA_HOME`** must point at Android Studio's JBR (JDK 21) for both Gradle and
  the Firebase emulators: `C:\Program Files\Android\Android Studio\jbr`. **But**
  check it first — this machine's copy has been found broken (`lib\jvm.cfg`
  missing, every `java.exe` invocation dies instantly). Microsoft JDK 21 at
  `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot` works for Gradle and the
  emulators; verify with `java -version` before blaming anything else.
- **Git Bash rewrites device paths.** `adb shell ... /sdcard/x.png` becomes
  `C:/Program Files/Git/sdcard/...`. Always `export MSYS_NO_PATHCONV=1`.
- **PowerShell `>` corrupts binaries.** Never `adb exec-out screencap -p > f.png`;
  use `adb shell screencap` then `adb pull`.
- **PowerShell splits `-PausgegebenVersionName=1.2.3`** at the dots. Quote it, or
  run Gradle from Bash.
- **`assembleProdRelease` without `-P` flags produces versionCode 1**, and
  installing it over a real release fails as a downgrade — sometimes *silently*.
  Always confirm with `adb shell dumpsys package … | grep versionCode`.
- **Reading the Firestore emulator over REST unauthenticated returns 403**, whose
  body parses to `documents: undefined` and looks like "0 documents". Use
  `Authorization: Bearer owner`. This produced a completely false "seeding is
  broken" conclusion once.
- **Emulator backends:** web `npm run dev -- --mode emulator`; Android
  `adb shell setprop debug.ausgegeben.fb_emulators 1` (debug builds only).
- **Firestore rules gate every write on `isEmailVerified()`.** Test accounts must
  be verified or everything 403s. On the Auth emulator, set it with
  `POST /identitytoolkit.googleapis.com/v1/projects/<p>/accounts:update` and
  `Authorization: Bearer owner`.
- **Do not screenshot or drive the user's physical phone.** It holds real
  financial data, and a stray coordinate tap once hit a password-visibility toggle
  and exposed their password. Use the AVD with throwaway accounts.

---

## 5. Commands

```bash
# web
cd web && npm test && npm run lint && npm run lint:css && npm run build
cd web && npm run test:rules      # 37 rules tests, Firestore emulator
cd web && npm run test:emulator   # 39 repository tests, Firestore emulator
cd web && npm run smoke           # smoke-test the deployed site

# android (JAVA_HOME set)
./gradlew testProdDebugUnitTest lintProdDebug assembleProdDebug
./gradlew connectedProdDebugAndroidTest   # needs a running AVD
./gradlew assembleProdRelease             # exercises R8; needs keystore.properties

# release
git tag v1.2.3 && git push --tags
```

---

## 6. Working style the user expects

- Say what you verified and how. Distinguish "tested on a device" from "compiles".
- Correct yourself plainly when wrong, and keep going — this file exists partly
  because several confident diagnoses in its history were wrong and had to be
  retracted.
- Don't manufacture a backlog. When the useful work is done, say so.
