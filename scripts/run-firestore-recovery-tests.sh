#!/usr/bin/env bash
# Requires Python 3.10+, Node, npm ci --prefix web, JDK 21+, and the Android SDK.
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) exec python scripts/firestore_recovery_runner.py "$@" ;;
  *) exec python3 scripts/firestore_recovery_runner.py "$@" ;;
esac
