# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Use GitHub's **private vulnerability reporting** for this repository
(**Security → Report a vulnerability**), which keeps your report confidential until a
fix is released. Include, where possible: the affected component (Android app / web
PWA / Firestore rules / telemetry Worker / CI), a description of the impact, and
reproduction steps or a proof of concept.

You can also reach the maintainer directly via the email address on the GitHub
profile if GitHub's reporting flow is unavailable to you.

## Scope

In scope:

- Firestore security rules (authorization, deletion freeze, amount/precision
  validation, timestamp skew, idempotency-key handling)
- Authentication and session handling in both clients (persistence, cross-tab
  invalidation, account deletion)
- Local storage encryption and cleanup on both platforms
- The telemetry Worker (`tools/error-endpoint`) and its privacy guarantees
- The CI/release pipeline (workflow hardening, signing, provenance)

Out of scope:

- Reports that require a rooted device, a malicious USB debug session, or access to an
  already-unlocked device profile
- Missing hardening on demo/emulator configurations
- Volumetric attacks against rate limits that are already documented as approximate

## Supported versions

Only the latest release of each client (Android APK and web PWA) and the deployed
Firestore rules are supported.

## Data handling notes

Ausgegeben stores financial transactions per user in Firestore. On-device data is
protected with platform mechanisms (Android Keystore-sealed preferences,
opt-in-only durable caching on the web) — see `docs/audit-remediation.md` for the
current security posture and its documented limitations.
