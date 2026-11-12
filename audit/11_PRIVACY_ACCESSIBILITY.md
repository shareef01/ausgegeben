# Privacy, accessibility, and localization

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

## Privacy and data lifecycle

| Surface | Source evidence and limits |
|---|---|
| Android device backup | `app/src/main/AndroidManifest.xml:9–13` disables OS backup and points to exclusions. `app/src/main/res/xml/data_extraction_rules.xml:3–14` excludes database, files, shared preferences and external files from cloud backup and device transfer. Validate device/vendor behavior before making user-facing guarantees. |
| Device data | The Firestore SDK cache, auth credentials, pending expense journals and snapshots each have a separate lifecycle. Web Firestore persistence and persistent auth are independently controlled in `web/src/services/firebase.ts:145–201,253–347`. Confirm shared-device, disabled-storage and cross-tab sign-out paths through the [sync audit](04_OFFLINE_SYNC_AND_CONCURRENCY.md). |
| Android preference encryption | `app/src/main/java/com/aus/ausgegeben/data/PrefsCrypto.kt:57–97` uses a Keystore-backed cipher but falls back to plaintext on sealing failure. The fallback preserves availability and weakens at-rest protection for affected values. Test invalidated/locked Keystore on a real device and assess affected keys before changing fallback behavior. Existing plaintext values require a readable migration path. |
| Manual backups | Exported JSON intentionally carries financial records. Treat exported files as sensitive and verify expected destination and retention behavior through [backup and restore](06_BACKUP_RESTORE.md). Android uses an unexported FileProvider with URI grants (`AndroidManifest.xml:42–50`). Test share recipients and cache cleanup separately from app-private storage. |
| Telemetry and logging | `web/src/services/errorReportPreference.ts:12–20` checks an opt-in flag. `web/src/services/errorReporter.ts:75–104` still sends errors and context to the browser console when remote reporting is disabled. Distinguish local logs, client sanitization and server retention. The Android auth ViewModel also logs exception messages (`AuthViewModel.kt:210`). Review representative SDK error payloads with disposable data to establish actual content. |
| Third-party requests | The app connects to Firebase Auth/Firestore/App Check and the configured error endpoint. `firebase.json` enumerates the production CSP domains. This is a code inventory, while a network trace is needed to establish actual request data by feature and consent state. |
| Account deletion | Follow Firestore collections, cloud account, local cache and manual exports independently. Verify pending/retry semantics against [security](02_SECURITY_AUDIT.md) and [offline sync](04_OFFLINE_SYNC_AND_CONCURRENCY.md). |

GDPR review should verify the deployed controller/processor arrangements, data residency and transfers, actual deletion and retention across cloud services and the error endpoint, and what the privacy notice promises for device copies and exported backups. These questions require deployment evidence and legal review.

## Accessibility and localization

The web shell provides hidden/inert inactive panels, localized navigation labels and live status messages (`web/src/views/MainShell.tsx:184–197,218–262`). Dialogs set modal semantics and restore previous focus (`web/src/views/SettingsView.tsx:654–670`, `web/src/hooks/useFocusTrap.ts:22–68`). The global stylesheet includes a reduced-motion override (`web/src/theme/global.css:102`). Check keyboard traversal across nested modals, error announcements and focus after deleting a row. Web locale switches update `document.documentElement.lang` (`web/src/App.tsx:38–40`). The Android EN/DE resources, locale configuration, theme contrast tests and touch target instrumentation provide static coverage. Screen-reader semantics, high text scale, contrast on rendered surfaces, reduced motion and viewport overflow across themes still need browser/device validation. Currency and date behavior are covered in [cross-platform parity](09_CROSS_PLATFORM_PARITY.md).

An in-memory Node check compared string resource names in `app/src/main/res/values/strings.xml` and `app/src/main/res/values-de/strings.xml`. Each contained 459 matching names, with zero names exclusive to either resource file. Translation quality, text length and placeholder compatibility require separate checks.

### AUS-303 · Settings radios ignore arrow navigation

| Field | Detail |
|---|---|
| Severity and classification | P3 Low, confirmed bug |
| Affected code | `web/src/views/SettingsView.tsx:515–578,600–631`, `web/src/hooks/useFocusTrap.ts:31–61` |
| Status | Source-confirmed. Browser regression proposed. |
| Evidence and root cause | Each Settings option is a native button with an ARIA radio role. All options remain tabbable and click handlers are the only selection mechanism. The dialog focus handler implements Tab wrapping and Escape. ARIA roles do not supply native radio keyboard behavior. |
| Reproduction | Open the theme, currency or language picker using a keyboard. Tab to an option, then press ArrowDown or ArrowRight. |
| Expected | Tab enters at the selected option and arrow keys move through the group. [W3C radio group keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/#keyboardinteraction) |
| Actual | Focus remains on the same option on arrow press. Tab advances through each individual option. Space/Enter still allow selection. |
| Impact | The interaction contradicts screen-reader radio semantics and adds tab stops to modal traversal. |
| Recommended fix | Use native radio inputs or implement the full ARIA keyboard pattern, with a selection confirmation or closing behavior that lets keyboard users navigate without dismissing the modal mid-traversal. |
| Regression test | In Playwright, open each picker via keyboard, assert entry at the checked radio, exercise arrow navigation/wrapping, confirm selection, and check focus restoration. |
| Compatibility | Preserve option values, localization, and persisted preference schema. |
