#!/usr/bin/env bash
# Decides whether a change can affect the Android app, so CI can skip the slow Android
# jobs (android, instrumentation, android_recovery_integration) on web-only PRs.
#
# Reads changed paths, one per line, on stdin. Prints `true` (run the Android jobs) or
# `false` (safe to skip). It is an allowlist: a change skips the Android jobs only when
# EVERY path is known not to reach them. Anything unrecognised runs everything.
#
# Deliberately NOT on the list, because the Android jobs do depend on them:
#   - web/package.json, web/package-lock.json: android_recovery_integration runs the
#     Firestore emulator from web/node_modules (scripts/firestore_recovery_runner.py)
#   - firestore.rules, firebase.json: that same job tests against the production rules
#   - .github/, scripts/, gradle files, app/: CI and the Android build themselves
#
# A tagged release re-runs every gate in release.yml regardless, and pushes to main
# always run everything, so this only ever shortens PR feedback.
#
# Run the tests: bash scripts/test-ci-android-affected.sh

set -uo pipefail

is_android_irrelevant() {
  case "$1" in
    web/src/*|web/e2e/*|web/qa/*|web/public/*|web/index.html) return 0 ;;
    docs/*) return 0 ;;
    */*) return 1 ;; # a Markdown file inside app/ (e.g. bundled assets) still counts
    *.md) return 0 ;; # top-level README.md, CHANGELOG.md, ...
    *) return 1 ;;
  esac
}

saw_any=false
while IFS= read -r path || [ -n "$path" ]; do
  [ -z "$path" ] && continue
  saw_any=true
  if ! is_android_irrelevant "$path"; then
    echo true
    exit 0
  fi
done

# An empty diff is suspicious (bad base ref, shallow clone): run everything.
if [ "$saw_any" = false ]; then
  echo true
else
  echo false
fi
