# Production audit remediation status

This file tracks remediation of F1–F12 from the production audit performed against
commit `c33bbb9d98c05ebe9de8346ad4f3f41818a54e01`. “Implemented” means present and tested
in this working tree; it does not mean deployed.

| Finding | Status | Result |
|---|---|---|
| F1/F2 | Implemented within Spark constraints; deployment required | Rules require recent reauthentication to create a permanent write-freeze marker. Both clients delete known collections with server-only pagination, verify empty, and only then delete Auth. Clients cannot clear the marker. |
| F3 | Implemented | Category type changes use a staged, resumable migration; both clients resume interrupted work and rules validate every transition. |
| F4 | Implemented | Android DataStore and web IndexedDB retain a payload fingerprint/idempotency key across restart and reuse it for ambiguous retries. |
| F5 | Implemented within platform limits | Web persistence is trusted-device opt-in; cross-tab termination and retry are used on erase. Android and web propagate cleanup failure. Neither claims secure overwrite. |
| F6 | Implemented | Orphan repair is document-ID paginated, checkpoints progress, distinguishes terminal errors, and marks the version complete only on a terminal page. |
| F7 | Implemented | Fork PRs use an isolated CI Firebase config and always execute R8 and instrumentation; release tags rerun the gates for the exact SHA. |
| F8 | Implemented | Preference writes are transactions, clocks are monotonic, and rules reject equal/older or far-future revisions. |
| F9 | Implemented compatibly | Rules reject sub-cent writes; Android/web aggregate in integer cents and normalize exports. Existing Firestore `amount` remains numeric for old-client compatibility. |
| F10 | Implemented | Client deletion has no fixed total-record ceiling, uses repeatable 400-document server pages, and verifies all known collections are empty before Auth deletion. |
| F11 | Implemented; deployment required | The PWA attaches Firebase App Check, the Worker verifies RS256/JWKS/issuer/audience/expiry/App ID, rate-limit failures fail closed, and CI tests/audits the Worker. |
| F12 | Implemented with upstream exceptions | Patched high-severity build dependencies are locked and full-tree high-severity audit gates run in CI/release. Remaining npm advisories are moderate upstream transitive issues described below. |

## Required rollout order

1. Deploy Firestore rules/indexes.
2. Release the web and Android clients.
3. Configure the Worker Firebase project number/App-ID allowlist, deploy it, and smoke-test
   a real App Check report.

The hardened rules must precede the clients because they enforce the recent-auth marker
and cross-client write freeze used by the Spark-compatible deletion protocol.

## Residual dependency advisories

- The web runtime audit is clean. The web development tree has seven moderate advisories
  under `firebase-tools`; forcing the suggested downgrade or major transitive overrides
  breaks the emulator/CLI. These packages do not ship in the PWA.
- The Cloudflare Worker tree has no current npm advisories.

CI fails on every high or critical npm advisory in the web and Worker trees.
Moderate advisories remain visible in job logs and should be removed when the upstream
Firebase packages resolve them without incompatible overrides.
