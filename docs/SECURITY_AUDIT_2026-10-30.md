# Security audit — 2026-10-30

Scope: the whole repository at `main` `9ed5117` (web 2.1.8 / Android v2.1.8), plus the
live GitHub settings and the public Hosting responses that the repository depends on.
Covered: Firestore rules and indexes, the web PWA (auth, sessions, cross-tab sign-out,
XSS/CSP, service worker, telemetry, backup import), the Android app (components,
intents, storage, logging, network config), the Cloudflare error Worker, CI/release
workflows and their secrets, and dependency advisories (npm and Gradle).

Earlier audits (`AUDIT.md`, `AUDIT_REPORT.md`, `docs/AUDIT_2026-09-*.md`) were read
first. Items they reported that are now fixed are not repeated; items still open are
listed briefly in "Still open from earlier audits".

Nothing in production was changed. No deploys, tags or pushes were made. The only
outbound requests were read-only: GitHub API reads of repository settings, `GET`s of
the public Hosting sites, one Identity Toolkit request with an obviously fake address
to test an old API key, and an OSV advisory lookup of public package versions.

## Summary

No way was found for one user to read or change another user's data. The rules held
under an emulator probe of the newer restore paths, and the web and Android clients
are in good shape. The real problems are in the parts around the apps:

1. **The Android signing key is not behind the release approval gate.** The workflow
   comment says it is, but the secrets sit at repository level, so any workflow run in
   the repo can read them without approval.
2. **Any verified account can fill the project's free storage quickly.** The restore
   "safety snapshot" documents accept about 1 MB of arbitrary data per write, under any
   ID, with no restore running. Because the Spark plan's 1 GiB storage limit is shared
   by the whole project, one person could stop saving from working for every user.
3. **An old build of the app is still live on the project's default Hosting
   address** with none of the security headers. It is inert today because its API key
   has expired.
4. **Android dependencies get no vulnerability alerts at all.** One known advisory is
   present today; it can't be exploited in this app.

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | **Medium** (high impact, low likelihood) | CI / signing | Signing secrets are repository-wide, so the `production-release` approval gate does not protect them |
| 2 | **Medium** | Firestore rules | Restore-snapshot and restore-operation documents accept unbounded arbitrary data, which lets one account exhaust project-wide storage |
| 3 | Low | Hosting | Stale June 2026 build still served on `ausgegeben01.web.app` / `.firebaseapp.com` without CSP or anti-framing headers |
| 4 | Low | Supply chain | Android (Gradle) dependencies are invisible to GitHub's dependency graph; Guava 32.1.3 advisory present |
| 5 | Low | Supply chain | 11 low/moderate npm advisories in web dev tooling (production bundle and Worker are clean) |
| 6 | Informational | CI | Small hardening gaps in repo settings (any ref may deploy to the release environment; SHA pinning not enforced by setting) |

---

## 1. Signing secrets bypass the release approval gate — Medium

**What an attacker could do to a user.** Anyone who can push a branch to this
repository can add a few lines of workflow that print or upload the Android signing
key, and no approval prompt appears. That includes a stolen GitHub token, a compromised
laptop or coding agent with push rights, or a future collaborator. With the key they can
sign their own APK that Android accepts as an **update** over the real Ausgegeben on
every user's phone. The fake update would run inside the user's signed-in session and
could read or send away all of their transactions. The key has no offline copy and
can't be revoked for apps already installed, so a leak would be permanent.

**Evidence.**

- `.github/workflows/release.yml:203-207` says the signing secrets "live in the
  production-release GitHub Environment, which requires a manual deployment approval".
- Live settings (GitHub API, 2026-10-30):
  - `GET /repos/shareef01/ausgegeben/actions/secrets` returns
    `AUSGEGEBEN_KEYALIAS`, `AUSGEGEBEN_KEYPASSWORD`, `AUSGEGEBEN_KEYSTORE_BASE64`,
    `AUSGEGEBEN_STOREPASSWORD`, `GOOGLE_SERVICES_JSON`, all at **repository** level.
  - `GET /repos/shareef01/ausgegeben/environments/production-release/secrets` returns
    **no secrets**.
  - The environment does have a required reviewer, but `deployment_branch_policy` is
    `null`, so any branch or tag may deploy to it.
- GitHub gives repository secrets to every workflow run from this repository: pushes
  to any branch (a workflow file added on a branch runs from that branch),
  `workflow_dispatch` from any ref, and same-repo pull requests (`ci.yml:6`). Only
  forks and Dependabot runs are excluded. The `environment:` line protects only secrets
  stored *in* that environment. The `main` ruleset requires a PR to merge into `main`
  but does not restrict pushing other branches.
- I did not push a test branch to prove this live, because that would be an outward
  action on the real repository. The conclusion rests on the settings above plus
  GitHub's documented secret scoping.

**Why only Medium.** Today the only account with write access is the maintainer's
(`collaborators` = `shareef01`, admin). Someone holding that account's full
credentials could also approve the environment deployment themselves. So the gap
mainly matters for partial access: a token or agent that can push code but would
never be used to click "Approve deployment". The damage if the key leaks is severe and
can't be undone.

**Related.** `workflow_dispatch` checks out `inputs.tag` with `actions/checkout`, which
also accepts a branch name. A branch named like `v9.9.9` passes the version regex
(`release.yml:288`) and is built and signed. Approval is still required, and the
tag-creation ruleset stops `gh release create` from making a new tag. A deployment
policy limited to `v*` tags closes this as well.

## 2. Restore snapshot documents are an unbounded storage sink — Medium

**What an attacker could do to a user.** Anyone with a verified account (including
a throwaway Google or email sign-up) can, from the real web app's console or a
script, write about 1 MB of junk per write into their own `restoreSnapshot`
collection, under any document IDs, as often as they like. The Spark plan gives the
**whole project** 1 GiB of storage, so roughly 1,200 such writes fill it, which takes
minutes. From then on, other users can't reliably save transactions or settings until
someone finds and deletes the junk by hand. No user's data is exposed, but the app
stops working for everyone. App Check, if enforced, makes scripting harder but does
not prevent this, because the requests can come from the genuine app in a browser.

**Evidence.**

- `firestore.rules:440-463` (`validSnapshotDoc`) checks that `expenses`,
  `categories`, `categoryBudgets`, `recurringTemplates` and `recurringReceipts` *are
  lists* and `preferences` *is a map*. It does not limit their length, element type or
  content. `firestore.rules:661-668` accepts any `chunkId` and does not require a
  matching `meta/restoreOperation` to exist.
- `firestore.rules:400-402` likewise accepts `plannedCounts`, `progress` and
  `snapshotMeta` on `meta/restoreOperation` as maps of any size.
- **Emulator probe** (real `firestore.rules`, Firestore emulator on a private port,
  `@firebase/rules-unit-testing`): all 5 cases passed.
  - A verified user wrote five `restoreSnapshot/junk-N` documents of ~900 KB each
    (`expenses: [900 × 1000-char strings]`), with no restore operation present.
    **Accepted.**
  - `meta/restoreOperation` with a ~900 KB `progress` map: **accepted**.
  - For comparison, an expense note of 2,001 characters: **refused**.
  - Another user reading or writing those snapshot docs, including with a forged
    `ownerUid`: **refused**. Unverified accounts: **refused**.
  - The probe file is kept outside the repository (session scratchpad,
    `zz-audit-probe.rules.test.ts`). It is not committed.
- The real clients never need this much freedom: `web/src/services/restoreLimits.ts:6`
  sets `SNAPSHOT_CHUNK_SIZE = 100` records per chunk.

**Context.** Every expense write is already free storage of up to ~2 KB. Filling
1 GiB that way takes about 500,000 writes, which is 25 days of the project's 20,000
daily free writes. The snapshot path makes the same abuse roughly 500 times cheaper.
The per-day *write* quota can still be used up by one account with ordinary expenses.
That is a known limit of a client-only Spark design and is not counted here.

**Not verified.** How production Firestore behaves at the exact moment the 1 GiB
Spark limit is reached. This was deliberately not tested against production.

**Status.** Partly fixed on branch `fix/restore-snapshot-bounds`; see recommended
fix 2 for what the change does and what it still leaves open.

## 3. Old build still served on the default Hosting site — Low

**What an attacker could do to a user.** Very little today. The project's default
Hosting site (`https://ausgegeben01.web.app` and `https://ausgegeben01.firebaseapp.com`)
still serves an Ausgegeben build last modified on 2026-06-26. It has **no** CSP, no
`X-Frame-Options`/`frame-ancestors`, and no `nosniff`, and it lacks App Check and every
session fix since then. Its embedded API key returns "API key expired", so it can't
sign in or reach Firestore. The risk is that it comes back to life: if that key were
ever renewed or restored, an unpatched, frameable copy of the app would talk to the
production database again. Anyone who installed it as a PWA from that address also
keeps a broken app with no path to the real one.

**Evidence.** `curl -sI https://ausgegeben01.web.app/` returns `Last-Modified: Fri,
26 Jun 2026 23:55:40 GMT` and no security headers except HSTS. Compare
`https://aus01.web.app/`, which serves exactly the `firebase.json` headers. The old
bundle `assets/index-D0Yh6vpy.js` has `projectId:"ausgegeben01"`, uses a different
API key from the current production key, contains no `initializeAppCheck`, and
the Identity Toolkit API rejects its key as expired. `firebase.json` targets only
the `aus01` site, so the repo never updates or cleans up the default site.

## 4. No vulnerability alerts for Android dependencies — Low

**What an attacker could do to a user.** Nothing specific today. The risk is that a
future serious flaw in an Android library (Firebase, AndroidX, OkHttp/gRPC inside
Firestore) would ship unnoticed. GitHub's alerts only cover the web and Worker code.

**Evidence.**

- `GET /repos/shareef01/ausgegeben/dependency-graph/sbom` contains **0** Maven
  packages. GitHub can't read the Kotlin DSL plus version catalog without a dependency
  submission, and CI has none (`grep dependency-submission` returns nothing). So
  Dependabot *alerts* never fire for Android. The monthly *version* updates in
  `.github/dependabot.yml` still run.
- I resolved `:app:dependencies --configuration prodReleaseRuntimeClasspath`
  (213 packages) and queried OSV. One hit: **`com.google.guava:guava 32.1.3-android`,
  GHSA-xxph-c9ww-hj94** (rated High upstream, fixed in 33.7.2). It comes in through
  `com.google.firebase:firebase-firestore 26.6.0`. The flaw needs Java
  `ObjectInputStream` deserialization of attacker data, and the app has none
  (`grep ObjectInputStream|Serializable app/src/main` returns nothing). **Not
  exploitable here.**

## 5. npm advisories in web dev tooling — Low

`npm audit` (web): 4 low, 7 moderate, 0 high/critical. All are in dev-only trees:
`@vitest/mocker` (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp, which matter only while a
Vitest browser/UI server is running on the developer machine), `uuid` and
`@opentelemetry/core` under `firebase-tools`, and `deepmerge` under `workbox-build`.
`npm audit --omit=dev` (what ships in the PWA): **0**. Worker
(`tools/error-endpoint`): **0**. GitHub shows the same four open Dependabot alerts.
None of these reach users. Update Vitest when a fixed release is available. The rest
waits on upstream, as `docs/audit-remediation.md` already notes.

## 6. Informational CI hardening

- The Actions setting `sha_pinning_required` is `false`. Every `uses:` in all three
  workflows is pinned to a full SHA today, and turning the setting on would keep it
  that way.
- `release-tag-protection` lets the owner bypass tag rules (`bypass_mode: always`),
  and `main-branch-protection` needs 0 approvals. Both are reasonable for a solo
  maintainer. They just mean the only real barrier to a release is the maintainer
  account itself, which is why finding 1 matters.

---

## Still open from earlier audits (re-checked, unchanged)

All are Low or Informational, and the earlier severity still stands:

- CSP `connect-src` includes `https://*.googleapis.com` (`firebase.json:21`). This is
  wider than needed, but there is no injection point to exploit it.
- `AuthViewModel.kt:210` logs the raw Firebase auth exception message to logcat. Only
  readable with adb access.
- Rules check text field lengths but not control or bidirectional characters. This
  only affects the user's own data.
- The Worker's rate limit is approximate across Cloudflare data centres. This is
  documented and accepted.
- `ausgegeben-onboarding-complete:<uid>` stays in `localStorage` after sign-out.
  Low sensitivity.
- The 8-character password minimum is enforced only in the clients
  (`AuthView.tsx:54`). A raw sign-up call can still use Firebase's default of 6.
  This only affects the person choosing the password. A Firebase Auth password
  policy would close it.

## Checked and fine

- **Isolation.** Every rule is under `users/{userId}` with `isOwner`. There is no
  collection-group or wildcard rule, and `users/{userId}` itself is denied. The probe
  confirmed the newer restore paths keep that isolation. Ownership comes from the path,
  never from a body field (`ownerUid` is additionally pinned to `request.auth.uid`).
  Writes require verified email, and account deletion requires a fresh `auth_time`.
- **Web XSS/CSP.** There are no `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, `window.open` or `javascript:` uses in `web/src`. The live CSP on
  `aus01.web.app` matches `firebase.json`: no `unsafe-inline`/`unsafe-eval`,
  `object-src 'none'`, `frame-ancestors 'none'`. `index.html` has no inline script.
  The service worker precaches only static assets.
- **Sessions.** Auth is session-only unless the user opts in. The non-persistent
  hierarchy no longer falls back to durable storage (`firebase.ts:154-158`).
  Sign-out and deletion reset both trusted-device flags, clear the journal, the
  all-time cache and the Firestore IndexedDB cache, and broadcast to other tabs.
  Receiving tabs sign out their own sessionStorage copy (`authService.ts:54-80`).
- **Data in URLs and telemetry.** The only query parameter is `?tab=`, reset on
  sign-out. Error reports send `location.pathname` (no query), error name, message and
  stack after credential redaction, user agent and build mode. They send no uid,
  email, amounts or notes, need an App Check token, and are capped at 10 per session.
  The Worker verifies App Check signatures against Google's JWKS, checks origin, caps
  the body while streaming, strips control characters, and does not log the client IP.
- **Backup import.** Both clients cap files at 10 MB (`backupRestore.ts:25`,
  `RestoreUtils.kt:9`, streamed), validate the schema strictly (IDs without `/`,
  bounded lengths, exact-key recurring sections), and refuse dangling category
  references before writing. Every write still goes through the rules.
- **Android.** `allowBackup=false` with full backup and transfer exclusions. Only the
  launcher activity is exported, and its single boolean extra just opens the Add
  screen. `BootReceiver` and the `FileProvider` are not exported, and the provider is
  limited to `cache/exports/`, which is wiped before each export and on sign-out
  (`ExportUtils.kt:215`, `PreferenceManager.kt:589`). The one `PendingIntent` is
  immutable. Cleartext traffic is allowed only in the debug source set, and only to
  emulator loopback addresses. Emulator routing and App Check debug secrets are gated
  on `BuildConfig.DEBUG`. Preferences are Keystore-sealed with a documented
  plaintext fallback. There is no WebView.
- **Workflows.** All actions are SHA-pinned, Gradle wrapper validation runs, and
  `distributionSha256Sum` is set. Default token permissions are read-only, and only
  the publish job gets write access. There is no `pull_request_target`. The earlier
  shell-injection pattern is fixed (values go through `env:`, and the regex is
  anchored to the whole string). The signed APK's certificate is checked against
  `.github/release-cert.sha256` and gets build provenance. Secret scanning, push
  protection and Dependabot security updates are on.
- **Local signing files.** `ausgegeben-release.jks`, `keystore.properties` and
  `local.properties` are untracked (`git ls-files` returns only the `.example` files).

## Not verifiable from here

- Whether Firestore App Check enforcement is switched on in the Firebase console.
- Whether the production API key has HTTP-referrer and API restrictions.
- Whether the deployed production rules are byte-identical to `firestore.rules`. This
  needs a signed-in `firebase firestore:rules` read.
- Whether Cloudflare Workers Logs (with `observability.enabled`) record request
  metadata such as client IP on their own, and how long they keep it.
- What Spark does at the moment stored data reaches 1 GiB (see finding 2).

## Recommended fixes

In order of priority:

1. **Move the signing secrets into the environment.** Recreate
   `AUSGEGEBEN_KEYSTORE_BASE64`, `AUSGEGEBEN_STOREPASSWORD`, `AUSGEGEBEN_KEYALIAS` and
   `AUSGEGEBEN_KEYPASSWORD` as **environment secrets** of `production-release`, then
   delete the repository-level copies. `GOOGLE_SERVICES_JSON` can stay at repository
   level because CI needs it and it grants no backend access on its own. Also set the
   environment's deployment policy to "selected tags: `v*`". This is a settings
   change only the maintainer can make (the secret values are needed). No workflow
   edit is required, because `release.yml` already declares the environment.
2. **Cap the restore snapshot documents (done on `fix/restore-snapshot-bounds`).**
   Capping list *lengths* would not help: rules can't check the items of a list, so
   one item can be a 900 KB string. The fix caps the *number* of documents instead.
   It accepts only the IDs the apps write (`meta`, `chunk_0`–`chunk_99`,
   `receipt_chunk_0`–`receipt_chunk_99`), and only while the account's restore
   journal is in `PREPARING` with the same operation ID. Both apps now put 300
   records in each document, so restore keeps working up to 30,000 transactions.
   Larger accounts are refused before any snapshot document is written. That limits
   one account to about 200 MB, so filling the project would take at least five
   verified accounts, where today it takes one. The fully closed version is a
   redesign that stores one rules-checked document per record. Deploy rules first,
   as usual. Older app versions keep working, because they also write `chunk_N`
   while `PREPARING`, at 100 records per document. On those versions an account with
   more than 10,000 transactions has its replace refused at the snapshot step, before
   any of its data changes.
3. **Retire the default Hosting site.** Either deploy a one-file page to
   `ausgegeben01` that redirects to `https://aus01.web.app` (with the same headers),
   or disable that site. Either one is a production change for the maintainer to
   decide.
4. **Give Android dependencies alerting.** Add a SHA-pinned
   `gradle/actions/dependency-submission` step on pushes to `main`, so Dependabot
   alerts cover the Android classpath. Take the Guava fix when a Firebase BoM brings
   in ≥ 33.7.2, rather than forcing it.
5. **Small settings.** Turn on "Require actions to be pinned to a full-length commit
   SHA". Configure a Firebase Auth password policy with a minimum of 8 characters to
   match the clients. Update Vitest once its advisory is fixed.
