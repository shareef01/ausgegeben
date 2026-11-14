#!/usr/bin/env bash
# Refuse a release whose versionCode is not above every published APK's (AUS-402).
#
# Usage: release-require-newer-version-code.sh REPOSITORY NEW_CODE
# Needs gh (with GH_TOKEN) and apkanalyzer on PATH.
#
# Android will not install an APK over one with an equal or higher versionCode, and
# the code inside APKs users already downloaded is the real boundary, so read it from
# every published asset.
#
# The release list used to be read straight into the loop through process
# substitution, where a failed `gh api` is invisible: the loop just saw no input and
# compared against 0, so an API error passed the guard. Fetch the list first, as its
# own checked command. A failure (including one partway through pagination) stops
# the release. A successful empty list still passes: the first release has nothing
# to compare against.
set -euo pipefail

REPOSITORY="${1:?usage: release-require-newer-version-code.sh REPOSITORY NEW_CODE}"
NEW_CODE="${2:?usage: release-require-newer-version-code.sh REPOSITORY NEW_CODE}"

if [[ ! "$NEW_CODE" =~ ^[0-9]+$ ]]; then
  echo "::error::New versionCode '$NEW_CODE' is not a number" >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
URLS="$TMP_DIR/asset-urls.txt"

if ! gh api --paginate "repos/$REPOSITORY/releases?per_page=100" \
  --jq '.[] | select(.draft == false) | .assets[]? | select(.name | endswith(".apk")) | .url' \
  > "$URLS"; then
  echo "::error::Could not list the published releases, so the versionCode cannot be checked. Re-run the release once the GitHub API is reachable." >&2
  exit 1
fi

MAX_RELEASED_CODE=0
ASSET_NUMBER=0
while IFS= read -r ASSET_URL; do
  [ -z "$ASSET_URL" ] && continue
  ASSET_NUMBER=$((ASSET_NUMBER + 1))
  APK="$TMP_DIR/released-$ASSET_NUMBER.apk"
  if ! gh api -H "Accept: application/octet-stream" "$ASSET_URL" > "$APK"; then
    echo "::error::Could not download published asset $ASSET_URL" >&2
    exit 1
  fi
  if ! CODE=$(apkanalyzer manifest version-code "$APK") || [[ ! "$CODE" =~ ^[0-9]+$ ]]; then
    echo "::error::Could not read a numeric versionCode from published asset $ASSET_URL" >&2
    exit 1
  fi
  if [ "$CODE" -gt "$MAX_RELEASED_CODE" ]; then
    MAX_RELEASED_CODE="$CODE"
  fi
done < "$URLS"

if [ "$NEW_CODE" -le "$MAX_RELEASED_CODE" ]; then
  echo "::error::versionCode $NEW_CODE must be greater than published maximum $MAX_RELEASED_CODE" >&2
  exit 1
fi
echo "versionCode $NEW_CODE is newer than published maximum $MAX_RELEASED_CODE ($ASSET_NUMBER published APKs checked)"
