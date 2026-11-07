#!/usr/bin/env bash
# Tests scripts/ci-android-affected.sh: which changed-file sets may skip the Android CI jobs.
#
# Run: bash scripts/test-ci-android-affected.sh

set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failures=0
total=0

# expect WANT DESCRIPTION PATH...
expect() {
  local want="$1" desc="$2"
  shift 2
  total=$((total + 1))
  local got
  got="$(printf '%s\n' "$@" | bash "$here/ci-android-affected.sh")"
  if [ "$got" = "$want" ]; then
    echo "ok:   $desc -> $got"
  else
    echo "FAIL: $desc -> got $got, want $want"
    failures=$((failures + 1))
  fi
}

# Web-only and docs-only changes may skip.
expect false "web CSS only"            web/src/theme/premium.css
expect false "web view + i18n"         web/src/views/RecordView.tsx web/src/i18n/en.ts
expect false "web e2e + qa + public"   web/e2e/layout.spec.ts web/qa/states.mjs web/public/icon.svg
expect false "web index.html"          web/index.html
expect false "docs only"               docs/maintenance.md README.md

# Anything the Android jobs read, or anything unrecognised, runs them.
expect true  "Android source"          app/src/main/java/Foo.kt
expect true  "web + Android together"  web/src/App.tsx app/build.gradle.kts
expect true  "web package-lock"        web/package-lock.json
expect true  "web package.json"        web/package.json
expect true  "firestore rules"         firestore.rules
expect true  "firebase.json"           firebase.json
expect true  "CI workflow"             .github/workflows/ci.yml
expect true  "scripts"                 scripts/firestore_recovery_runner.py
expect true  "gradle catalog"          gradle/libs.versions.toml
expect true  "web vite config"         web/vite.config.ts
expect true  "unknown top-level file"  something-new.txt
expect true  "empty diff"              ""
expect true  "path that only contains web/src" app/web/src/x.kt
expect true  "Markdown bundled in the app"     app/src/main/assets/help.md

echo
if [ "$failures" -ne 0 ]; then
  echo "$failures of $total cases failed"
  exit 1
fi
echo "all $total cases passed"
