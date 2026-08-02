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

**Legacy expense fields are tolerated, never written.** `cloudId`,
`categoryCloudId`, `receiptImagePath`, `deleted` are allowed by `validExpense()`
and bounded by type and size. `updatedAt` accepts **number or Timestamp**.
Tightening any of this re-freezes real rows written by older builds. Three
documents exist with no core fields at all; they are inert and intentionally left.

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

**Category reordering — device-verified as working on 2026-08-02.** The note below
is the historical context; the end-to-end verification it asked for has now been
done (AVD + emulator backend, current `main`): move arrows reorder correctly,
logcat stays free of `category_error_reorder_failed` / `PERMISSION_DENIED`, and
the `sortOrder` writes land in Firestore. Stress-tested against the two historical
failure modes — the hidden Uncategorized sentinel (`sortOrder 999`, id `'0'`)
present, and two categories sharing one `sortOrder` — plus a `sortOrder` gap; all
renumber correctly (sequential renumbering also normalises duplicates and gaps
away). If reordering breaks again, the write path and listener refresh were both
exercised and are not the culprit.

> Historical (pre-#16): reordering did not work. Reported after PR #16, which
> fixed two genuine causes but evidently not all of them:
>
> - the hidden Uncategorized sentinel (`sortOrder 999`) was counted when ranking
>   neighbours while `CategoryScreen` hides it
> - swapping `sortOrder` values is a no-op when two categories share one
>
> Both are fixed and covered by `CategoryReorderTest` (9 cases), but that fix was
> verified by unit tests only and never exercised on a device — which is exactly
> the mistake section 1 warns about.

---

## 4. Environment gotchas that will waste your time

- **`JAVA_HOME`** must point at Android Studio's JBR (JDK 21) for both Gradle and
  the Firebase emulators: `C:\Program Files\Android\Android Studio\jbr`.
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
