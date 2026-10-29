#!/usr/bin/env bash
# Runs the Android design-QA tests (DesignQaMatrixTest, NavigationModeLayoutTest) on an
# emulator and pulls the screenshots and report into docs/design-qa/android/<label>/.
#
#   ./gradlew assembleProdDebug assembleProdDebugAndroidTest
#   scripts/run-android-design-qa.sh after
#
# Emulator only: the navigation test switches the system navigation mode, and the debug
# build shares its applicationId with the release build on real phones.
set -euo pipefail
LABEL=${1:?usage: run-android-design-qa.sh <label>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ADB=${ADB_PATH:-"${LOCALAPPDATA:-$HOME}/Android/Sdk/platform-tools/adb"}
SERIAL=${ANDROID_SERIAL:-emulator-5554}
case "$SERIAL" in emulator-*) ;; *) echo "Refusing to run on $SERIAL: not an emulator" >&2; exit 1 ;; esac
adb() { "$ADB" -s "$SERIAL" "$@"; }

APK="$ROOT/app/build/outputs/apk/prod/debug/app-prod-debug.apk"
TEST_APK="$ROOT/app/build/outputs/apk/androidTest/prod/debug/app-prod-debug-androidTest.apk"
OUT="$ROOT/docs/design-qa/android/$LABEL"
DEVICE_DIR=/sdcard/Android/data/com.aus.ausgegeben/files/design-qa

# adb.exe on Windows needs native paths for files on the host.
host_path() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
adb install -r -t "$(host_path "$APK")" >/dev/null
adb install -r -t "$(host_path "$TEST_APK")" >/dev/null
adb shell rm -rf "$DEVICE_DIR"
adb shell am instrument -w -r \
  -e package com.aus.ausgegeben.ui.designqa \
  com.aus.ausgegeben.test/androidx.test.runner.AndroidJUnitRunner > "$ROOT/app/build/design-qa-$LABEL.txt" || true
rm -rf "$OUT" && mkdir -p "$OUT"
adb pull "$DEVICE_DIR/." "$(host_path "$OUT")" >/dev/null
grep -E "^INSTRUMENTATION_CODE|^OK|^FAILURES|Tests run" "$ROOT/app/build/design-qa-$LABEL.txt" || true
echo "Pulled $(ls "$OUT" | wc -l) files to $OUT"
