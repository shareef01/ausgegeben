# Android audit

Revision `f3897a6befb6fef999c32447a78b7f68c83010d5`.

The app uses Hilt to wire an Activity, repositories and workers. `MainActivity.kt:42–81` starts preference synchronization for the active UID, disposes it with the composition, and uses lifecycle-aware state collection. The records, insights and recurring ViewModels are keyed by UID (`MainActivity.kt:129–145`). This isolates their view state, although Activity-scoped instances live until the Activity store clears. Records and Insights offload calculations to `Dispatchers.Default` (`ExpenseViewModel.kt:133–162`, `InsightsViewModel.kt:116–128`). Firestore flows close registrations on cancellation (`AppRepository.kt:460,750,799,1143,1181`). Inspect listener and account-transition behavior alongside [offline sync](04_OFFLINE_SYNC_AND_CONCURRENCY.md).

WorkManager uses the Hilt worker factory with the default startup initializer removed (`AndroidManifest.xml:52–66`). A unique periodic worker replaces the former dependency chain, checks for qualifying activity that day, excludes tombstones and propagates coroutine cancellation (`DailyReminderWorker.kt:27–76`). Boot and timezone broadcasts re-anchor the job (`BootReceiver.kt:13–30`). Android 13+ reminder permission is gated by completed onboarding in the Activity (`MainActivity.kt:159–178`). The target is API 36 and the floor is API 29 (`app/build.gradle.kts:72–73`). Cleartext emulator overrides are in the debug manifest. See [CI and dependencies](12_CICD_DEPENDENCIES.md) for signing and [test execution](13_TEST_EXECUTION.md) for actual JVM and device coverage.

## AUS-301 · Opening the app can cancel an eligible reminder

| Field | Detail |
|---|---|
| Severity and classification | P2 Medium, confirmed bug |
| Affected code | `app/src/main/java/com/aus/ausgegeben/MainActivity.kt:148–157`, `app/src/main/java/com/aus/ausgegeben/notification/ReminderScheduler.kt:38–74,111–123` |
| Status | Source-confirmed. Device timing remains unverified. |
| Evidence and root cause | Initial Activity composition calls `scheduleNext` even when the stored reminder configuration is unchanged. The scheduler replaces existing unique periodic work with `CANCEL_AND_REENQUEUE`. After the configured local time, its new delay targets the next day. WorkManager is inexact and the request requires network, so eligible work can still be pending at replacement. [AndroidX periodic work policy](https://developer.android.com/reference/androidx/work/ExistingPeriodicWorkPolicy#CANCEL_AND_REENQUEUE) |
| Reproduction | Configure 19:00, leave the phone disconnected through 19:00, then launch or recreate the Activity at 19:05 while disconnected. Restore connectivity. Inspect the work ID and next schedule. |
| Expected | The unchanged configuration preserves the eligible work, allowing its ordinary network-constrained execution. |
| Actual | Activity startup replaces the work and anchors it to tomorrow at 19:00. |
| Impact | A daily reminder can be missed after opening the app, including when there are no qualifying transactions that day. |
| Recommended fix | Keep existing work on ordinary composition and use explicit replacement for changed hour/minute, timezone changes and drift recovery. Tag or store the schedule configuration to detect genuine changes after restart. |
| Regression test | With controlled clock and WorkManager constraints, bring up the Activity after the slot with an existing eligible work ID and assert the ID survives. Change the configured time and assert a new correctly anchored request. |
| Compatibility | Retain the unique work name and read legacy jobs once during migration. No financial data migration. |

Process-death form recovery, permission denial across Activity recreation, exact behavior under Doze, and notification taps through task reuse need device verification. `MainActivity.kt:85–88,181–186` stores the new intent outside observable Compose state and reads it through an effect. Exercise genuine `onNewIntent` delivery before deciding whether that path loses the open-add action on a warm Activity. Large-list jank, IME interactions and TalkBack are also pending device checks.
