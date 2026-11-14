#!/usr/bin/env bash
# Regression tests for the release guards AUS-401 and AUS-402. Runs in CI's
# workflow_validation job and locally:
#
#   bash scripts/test-release-guards.sh
#
# These run the real scripts that release.yml calls, not copies:
# - release-resolve-tag.sh and release-verify-remote-tag.sh against throwaway git
#   repositories (a bare "origin" and a clone), covering lightweight and annotated
#   tags, a branch with the tag's name, a tag off main, and a tag moved or deleted
#   after it was resolved.
# - release-require-newer-version-code.sh with fake gh and apkanalyzer commands on
#   PATH, covering an empty list, an API failure, a failure partway through
#   pagination, a failed download, an unreadable APK, and old vs new codes.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOLVE="$ROOT/scripts/release-resolve-tag.sh"
VERIFY="$ROOT/scripts/release-verify-remote-tag.sh"
REQUIRE="$ROOT/scripts/release-require-newer-version-code.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0
total=0

# expect_ok DESCRIPTION COMMAND... / expect_fail DESCRIPTION COMMAND...
expect_ok() {
  local desc="$1"; shift
  total=$((total + 1))
  if OUT=$("$@" 2>&1); then
    echo "ok:   $desc"
  else
    echo "FAIL: expected success — $desc"
    printf '%s\n' "$OUT" | sed 's/^/      /'
    failures=$((failures + 1))
  fi
}
expect_fail() {
  local desc="$1"; shift
  total=$((total + 1))
  if OUT=$("$@" 2>&1); then
    echo "FAIL: expected failure but it passed — $desc"
    printf '%s\n' "$OUT" | sed 's/^/      /'
    failures=$((failures + 1))
  else
    echo "ok:   $desc"
  fi
}
# expect_output DESCRIPTION EXPECTED COMMAND...: succeeds and prints EXPECTED on stdout
expect_output() {
  local desc="$1" expected="$2"; shift 2
  total=$((total + 1))
  local out
  if out=$("$@" 2>/dev/null) && [ "$out" = "$expected" ]; then
    echo "ok:   $desc"
  else
    echo "FAIL: $desc — expected '$expected', got '$out'"
    failures=$((failures + 1))
  fi
}

# ---------------------------------------------------------------------------------
echo "== AUS-401: resolving the tag to one commit =="

g() { git -c user.name=test -c user.email=test@example.invalid -c init.defaultBranch=main "$@"; }

g init -q --bare "$WORK/origin.git"
g clone -q "$WORK/origin.git" "$WORK/dev" 2>/dev/null
cd "$WORK/dev"
g commit -q --allow-empty -m A
A=$(git rev-parse HEAD)
g commit -q --allow-empty -m B
B=$(git rev-parse HEAD)
g push -q origin main
g checkout -q -b side
g commit -q --allow-empty -m S
S=$(git rev-parse HEAD)
g push -q origin side
g checkout -q main

g tag v1.0.0 "$A"                       # lightweight, on main
g tag -a v1.1.0 -m "annotated" "$B"     # annotated, on main
g tag v9.0.0 "$S"                       # off main
g branch v2.0.0 "$B"                    # a branch named like a tag, with no tag
g push -q origin --tags
g push -q origin v2.0.0

g clone -q "$WORK/origin.git" "$WORK/ci" 2>/dev/null    # what the resolve job sees
cd "$WORK/ci"

expect_output "lightweight tag resolves to its commit" "$A" bash "$RESOLVE" v1.0.0
expect_output "annotated tag is peeled to its commit" "$B" bash "$RESOLVE" v1.1.0
expect_output "tag push whose commit still matches" "$A" bash "$RESOLVE" v1.0.0 "$A"
expect_output "annotated tag push, expected given as the tag object" "$B" \
  bash "$RESOLVE" v1.1.0 "$(git rev-parse refs/tags/v1.1.0)"
expect_fail "tag moved after the push (expected commit differs)" bash "$RESOLVE" v1.0.0 "$B"
expect_fail "expected commit not in the clone" bash "$RESOLVE" v1.0.0 "$(printf 'f%.0s' {1..40})"
expect_fail "tag on a commit that is not on main" bash "$RESOLVE" v9.0.0
expect_fail "missing tag" bash "$RESOLVE" v3.0.0
expect_fail "a branch named like the tag does not count as the tag" bash "$RESOLVE" v2.0.0
expect_fail "tag without the v prefix" bash "$RESOLVE" 1.0.0
expect_fail "multi-line input (CI-3)" bash "$RESOLVE" "$(printf 'v1.0.0\ntouch /tmp/pwned')"
expect_fail "empty input" bash "$RESOLVE" ""

echo
echo "== AUS-401: the remote tag must still point at the tested commit =="

expect_ok   "lightweight tag unchanged" bash "$VERIFY" v1.0.0 "$A"
expect_ok   "annotated tag unchanged (compares the peeled commit)" bash "$VERIFY" v1.1.0 "$B"
expect_fail "wrong expected commit" bash "$VERIFY" v1.0.0 "$B"
expect_fail "missing tag" bash "$VERIFY" v3.0.0 "$A"
expect_fail "branch named like the tag does not count" bash "$VERIFY" v2.0.0 "$B"
expect_fail "unreachable remote" bash "$VERIFY" v1.0.0 "$A" "$WORK/no-such-remote.git"

# Move v1.0.0 to B and delete v1.1.0 on the remote after "resolving" them.
cd "$WORK/dev"
g tag -f v1.0.0 "$B" >/dev/null
g push -q -f origin v1.0.0
g push -q origin :refs/tags/v1.1.0
cd "$WORK/ci"
expect_fail "tag moved on the remote after resolving" bash "$VERIFY" v1.0.0 "$A"
expect_fail "tag deleted on the remote after resolving" bash "$VERIFY" v1.1.0 "$B"

# ---------------------------------------------------------------------------------
echo
echo "== AUS-402: versionCode guard fails closed =="

FAKE="$WORK/fakebin"
mkdir -p "$FAKE"
# Fake gh. The list call prints $FAKE_LIST and exits $FAKE_LIST_EXIT, which can model a
# failure partway through pagination. Downloads write "code:<n>" into the APK, or fail
# when the URL contains "broken-download".
cat > "$FAKE/gh" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = api ] && [ "$2" = --paginate ]; then
  [ -n "${FAKE_LIST:-}" ] && printf '%s\n' "$FAKE_LIST"
  exit "${FAKE_LIST_EXIT:-0}"
fi
if [ "$1" = api ] && [ "$2" = -H ]; then
  url="$4"
  case "$url" in *broken-download*) exit 1 ;; esac
  printf 'code:%s\n' "${url##*/}"
  exit 0
fi
echo "unexpected gh call: $*" >&2
exit 2
EOF
# Fake apkanalyzer: prints the code written by the fake download, or junk for "x".
cat > "$FAKE/apkanalyzer" <<'EOF'
#!/usr/bin/env bash
# Called as: apkanalyzer manifest version-code <apk>
code=$(sed -n 's/^code://p' "$3")
[ "$code" = x ] && { echo "not a number"; exit 0; }
[ "$code" = crash ] && exit 1
printf '%s\n' "$code"
EOF
chmod +x "$FAKE/gh" "$FAKE/apkanalyzer"

run_require() {   # run_require LIST LIST_EXIT NEW_CODE
  FAKE_LIST="$1" FAKE_LIST_EXIT="$2" PATH="$FAKE:$PATH" bash "$REQUIRE" owner/repo "$3"
}

TWO_ASSETS=$'https://api.example/assets/20116\nhttps://api.example/assets/20115'

expect_ok   "empty successful list (first release)" run_require "" 0 10000
expect_ok   "newer than every published APK" run_require "$TWO_ASSETS" 0 20117
expect_fail "equal to the published maximum" run_require "$TWO_ASSETS" 0 20116
expect_fail "older than the published maximum" run_require "$TWO_ASSETS" 0 20101
expect_fail "release list API fails with no output" run_require "" 17 20117
expect_fail "release list fails partway through pagination" run_require "https://api.example/assets/20115" 1 20117
expect_fail "an asset download fails" run_require $'https://api.example/assets/20115\nhttps://api.example/broken-download/1' 0 20117
expect_fail "an APK has no numeric versionCode" run_require "https://api.example/assets/x" 0 20117
expect_fail "apkanalyzer fails on an APK" run_require "https://api.example/assets/crash" 0 20117
expect_fail "non-numeric new code" run_require "" 0 "20117; rm -rf /"

echo
echo "$((total - failures))/$total checks passed"
if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) FAILED"
  exit 1
fi
echo "all checks passed"
