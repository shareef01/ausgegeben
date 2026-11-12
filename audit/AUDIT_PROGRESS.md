# Audit progress

- Discovery started 2026-11-12 Europe/Berlin.
- Branch `chore/release-2.1.17`, commit `f3897a6befb6fef999c32447a78b7f68c83010d5`, initially clean tracked and untracked status.
- Critical systems, finance and recurrence, and platform investigations assigned in parallel. Root owns test execution, architecture, operations and consolidated findings.
- Scope is tracked source at the recorded commit. Test execution uses isolated demo projects or synthetic configuration.

- Discovery pinned 542 tracked paths. The first Gradle invocation hit a failed directory change and overwrote the ignored Android Firebase client configuration with the CI fixture. The tracked tree was unaffected. Candidate recovery copies and previous build resources are being compared. Subsequent Android builds use a separate archived source tree and the checked-in synthetic fixture.
- Web unit suite passed (643 tests), telemetry Worker passed (19 tests), and local npm advisory access succeeded after retry. Android builds and isolated Firebase checks are running.

- Android local-config recovery completed. Both debug and release Google Services Gradle tasks regenerated resources that matched all seven entries in the corresponding pre-audit artifacts. The verified functional reconstruction is installed locally. Original raw JSON and unused metadata are unavailable.
- Rules suite passed all 146 checks. Targeted Firestore probes reproduced AUS-101 and the rejected rollback preference write in AUS-103. Chromium verified production-shell service-worker fallback offline.
- All 16 requested reports exist and relative Markdown links resolve. The findings register contains 13 entries. An additional emulator probe reproduced standalone receipt admission (AUS-203), and a local Bash probe reproduced the failed-release-list guard (AUS-402).
- Remaining execution at this checkpoint: collect the Android unit/lint/debug/R8 build and isolated API 29 instrumentation results, finish Firestore repository and Playwright suites, and run canonical Android recovery once its fixed emulator ports are free. Web repository runs have reported failures including timeouts. No complete repository-suite status has been inferred from partial output.
- Android JVM passed 436 tests, with 15 emulator-only skips subsequently passed by the canonical Android recovery runner. Android lint, debug APK, unsigned R8 APK, 40 API 29 instrumentation cases and 24 Chromium cases passed. The full Firestore repository run passed 174 of 180. Follow-up probes passed the selected budget cases and the large-history assertion with a longer deadline. The Python recovery supervisor self-tests passed five of five on repeat. Final check in progress is the repository's separate recovery acceptance harness for repeated runs and forced process interruptions.
- The recovery acceptance harness finished with exit 0. Three full reruns, four standalone scenarios, and the applicable forced-interruption and validation checks passed. All audit documents and the findings register are complete. The remaining verification gaps and the local configuration incident are recorded in the master and test reports. Tracked files match the audited revision.

## First remediation batch

- AUS-201. Web transaction and recurring forms validate the original amount text and reject out-of-range amounts. Chromium verified grouped input in both forms and rejection of a negative transaction amount.
- AUS-102. Android sign-out waits up to three seconds for the Firestore write queue. If it remains pending, the current session stays active and Settings prompts the user to reconnect. The emulator regression verified that a queued edit and deletion reached the server after reconnect.
- AUS-103. Both clients commit preferences with the terminal restore journal, calculate the write revision from the transaction's live server read, and delete the cloud preference document when the rollback snapshot captured absence. A legacy snapshot with an absent preference document contains no prior device-local preference values to recover. Devices with values already cached by an older failed restore can still republish them through ordinary preference sync.
- Verified 643 web unit tests, four Chromium cases, 23 final web restore integration cases, and 15 Android recovery integration cases. TypeScript, web hook lint, the production web build, Android JVM tests, and Android lint passed. Firebase verification used disposable local emulators.
