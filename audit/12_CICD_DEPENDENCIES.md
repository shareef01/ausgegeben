# 12 CI/CD, dependencies and release integrity

## Controls inspected

- CI starts on main pushes and PRs, uses read permissions globally, and narrows write grants to Gradle dependency graph submission and the aggregate commit-status publisher. The main CI result aggregates workflow validation, web, rules, browser, telemetry and conditional Android gates. Dependency review runs separately on PRs, with a critical threshold. Actual branch rules and required contexts were unavailable.
- The Android path filter is conservative for unknown paths, and release builds run the release gates independently. Android uses wrapper validation and a pinned distribution checksum. Release gates cover R8, instrumentation, web tests/build, rules, repository tests and telemetry. Android recovery-runner acceptance and the browser security gate remain CI-only.
- npm gates use lockfile installation and advisory checks at high severity. Both manifests use targeted transitive overrides. The Gradle catalog and settings apply version floors and a dependency-submission job gives GitHub the resolved graph. Floor entries establish a minimum in selected resolution paths and cannot substitute for scanning the resolved graph.
- Actions use full commit SHAs. APK publishing checks package/version metadata, pinned signing-certificate fingerprint and process survival, emits SHA256SUMS, attests APK provenance and then publishes assets. Signing secrets are restored after the gates, and the keystore is removed before the emulator step and on exit. The release environment approval is a declared dependency of the process.
- `smoke.yml` probes public Hosting headers, bundle and configuration on schedule, manual dispatch and specified main changes. The Hosting deployment commands live in `web/package.json`. Rules and Hosting can be deployed independently.. This audit left those commands unexecuted.
- Actual dependency verification data, branch/ruleset enforcement, release environment reviewers, deployed App Check configuration and artifact-to-commit comparison require external evidence. See the test report for scanner outcomes.

## AUS-401 · Release gates and signing independently resolve the requested ref

**Severity and classification:** P2 Medium, confirmed workflow bug. **Status:** Source-confirmed.

**Affected code:** `.github/workflows/release.yml:18–20,30–32,64–66,96–98,102–106,155–157,185–187,200–215,473–498`.

**Evidence and root cause:** Each gate and the secret-bearing publish job independently checks out the input name or event ref. The ancestry gate validates its own HEAD. The publish job uses the same mutable name and accepts no verified SHA from the gates. Release creation also omits `--verify-tag`. [GitHub Actions contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts), [GitHub CLI release create](https://cli.github.com/manual/gh_release_create)

**Reproduction and expected/actual:** In a throwaway repository, create tag T at an approved commit A, let the gates finish, move T to B before the protected job checks out, then compare every job's HEAD. The workflow should sign only the tested SHA and abort when T changes. Its source directs the protected job to resolve T again. Changing a tag requires sufficient permissions. Production tag mutability was unverified.

**Impact:** A release can sign a different tree from the one covered by its gates. The signed tree runs Gradle in the job that has signing inputs.

**Fix and regression:** Validate the exact tag namespace and peel to a commit once in an unprivileged resolver. Validate ancestry there. Use that immutable commit for each gate and build, then verify the current tag still points there before publish and require an existing tag. Test a tag move after gate completion, an annotated tag, and a branch/tag name collision. Compatibility risk is limited to invalid or moved tags and dispatches relying on branch aliases.

## AUS-402 · The versionCode check can proceed when the release-list request fails

**Severity and classification:** P2 Medium, confirmed workflow bug. **Status:** Reproduced in Bash.

**Affected code:** `.github/workflows/release.yml:310–338`.

**Evidence and root cause:** The consumer reads from Bash process substitution. The producer's `gh api` failure status is unavailable as the loop's exit status. The maximum starts at zero and the check can succeed with no input after an API error. A partial paginated result can produce an incomplete maximum.

**Reproduction and expected/actual:** Substitute a fake `gh` that exits 1 before emitting assets, supply a positive NEW_CODE, and run the loop. Expected behavior is a failing release gate. The loop sees EOF and the comparison proceeds with zero. In an isolated Bash probe with errexit and pipefail enabled, the fake CLI exited 17 and the guard accepted NEW_CODE=20117 with a maximum of zero. The API can legitimately return zero assets, so the fix must distinguish successful empty input from failure.

**Impact:** A lower code can be published during release API failures, leaving users unable to install the update over a higher-code APK.

**Fix and regression:** Fetch the asset list in a checked command before entering the loop. Test empty success, immediate API failure, partial output followed by error and maximum greater than the proposed code. Compatibility risk is limited to turning API outage or permission errors into an explicit release retry.

## Dependency advisory scan

On 2026-11-12, npm 11.13.0 audited both lockfiles against the public registry. Web returned exit 1 at its default severity threshold and listed seven entries (three moderate, four low), stemming from two root advisories. The Worker lockfile returned exit 0 with zero reported entries. These results are time-bound. No resolved Gradle advisory scan was established.

| Root advisory | Locked version and affected range | Exposure | Safe remediation |
|---|---|---|---|
| OpenTelemetry Core W3C baggage allocation, moderate | Transitive `@opentelemetry/core` 1.30.1, affected below 2.8.0. Via transitive `@google-cloud/pubsub` 5.3.1 (npm chain range 5.1.0–6.0.0) and direct dev `firebase-tools` 15.34.2 (npm chain range >=14.24.0). | CLI tooling dependency. An attacker-controlled baggage parsing path in the actual CLI operations was not established. | Verify a Firebase CLI/PubSub release with a compatible patched telemetry graph, then rerun both emulator suites. A 1.x-to-2.x override without confirming peer/API compatibility risks breaking the CLI. [Advisory](https://github.com/advisories/GHSA-8988-4f7v-96qf) |
| deepmerge object prototype poisoning, low | Transitive `deepmerge` 4.3.1, affected 4.2.0–4.3.1. Via transitive `@rollup/plugin-node-resolve` 16.0.3 and `workbox-build` 7.4.1, and direct dev `vite-plugin-pwa` 2.0.0. npm chain ranges are respectively >=8.0.0, >=6.0.0-alpha.0, and >=0.3.0. | PWA build tooling uses repository-controlled configuration. No route from user financial records to this merge call was established. | Move to an upstream-patched toolchain after validating the generated service worker. The downgrade npm suggests would regress toolchain compatibility and should not be applied automatically. [Advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) |

The seven npm entries include dependent packages along the two chains. Both advisory roots currently fall below the CI high-severity threshold. A separate SBOM would make locked versions and scope easier to correlate with provenance, especially for the APK and its build-only dependencies.
