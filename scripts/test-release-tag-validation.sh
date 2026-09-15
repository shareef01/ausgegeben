#!/usr/bin/env bash
# Regression test for CI-3 (release workflow command injection).
#
# Mirrors the exact tag-shape validation in .github/workflows/release.yml's
# "Derive version from tag" step (the `if [[ ! "$NAME" =~ ... ]]` line) so it can be
# exercised standalone, without running the whole release workflow. If that step's
# validation regex/logic ever changes, update the `validate_tag` function below to
# match — this is a deliberate mirror, not an extraction, so keeping them in sync is a
# manual step, not an automated one.
#
# Run: bash scripts/test-release-tag-validation.sh

set -uo pipefail

# --- mirror of the validation in .github/workflows/release.yml ("Derive version from tag") ---
validate_tag() {
  local TAG="$1"
  local NAME="${TAG#v}"
  if [[ ! "$NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    return 1
  fi
  return 0
}
# --- end mirror ---

failures=0
total=0

# expect_rejected TAG_VALUE DESCRIPTION
expect_rejected() {
  total=$((total + 1))
  local tag="$1" desc="$2"
  if validate_tag "$tag"; then
    echo "FAIL: expected rejection but ACCEPTED — $desc"
    printf '  tag (escaped): %q\n' "$tag"
    failures=$((failures + 1))
  else
    echo "ok:   rejected — $desc"
  fi
}

# expect_accepted TAG_VALUE DESCRIPTION
expect_accepted() {
  total=$((total + 1))
  local tag="$1" desc="$2"
  if validate_tag "$tag"; then
    echo "ok:   accepted — $desc"
  else
    echo "FAIL: expected acceptance but REJECTED — $desc"
    printf '  tag (escaped): %q\n' "$tag"
    failures=$((failures + 1))
  fi
}

echo "== malicious payloads: every one of these MUST be rejected =="

# Newline + shell command (the actual CI-3 bypass: a per-line regex check let the
# first line alone satisfy validation while smuggling a payload on a later line).
expect_rejected "$(printf 'v1.2.3\ntouch /tmp/pwned')" "newline + shell command"
expect_rejected "$(printf 'v1.2.3\nrm -rf /tmp/x')" "newline + destructive command"

# Command substitution
expect_rejected 'v1.2.3$(touch /tmp/pwned)' 'command substitution $()'
expect_rejected 'v$(echo 1).2.3' 'command substitution embedded mid-tag'

# Backticks
expect_rejected 'v1.2.3`touch /tmp/pwned`' 'backtick command substitution'

# Statement separators
expect_rejected 'v1.2.3; touch /tmp/pwned' 'semicolon-separated command'
expect_rejected 'v1.2.3 && touch /tmp/pwned' '&&-chained command'
expect_rejected 'v1.2.3 || touch /tmp/pwned' '||-chained command'
expect_rejected 'v1.2.3 | touch /tmp/pwned' 'pipe to a command'
expect_rejected 'v1.2.3 & touch /tmp/pwned' 'backgrounded command'

# Spaces / stray whitespace
expect_rejected 'v1.2.3 ' 'trailing space'
expect_rejected ' v1.2.3' 'leading space'
expect_rejected 'v1.2 .3' 'internal space'

# Malformed versions
expect_rejected 'v1.2' 'missing patch component'
expect_rejected 'v1.2.3.4' 'extra component'
expect_rejected 'v1.2.x' 'non-numeric component'
expect_rejected 'v' 'v with nothing after it'
expect_rejected '' 'empty string'

echo
echo "== legitimate tags: every one of these MUST be accepted =="
expect_accepted 'v1.2.3' 'simple valid tag'
expect_accepted 'v0.0.1' 'zero-leading valid tag'
expect_accepted 'v10.99.99' 'multi-digit components'
# TAG#v only strips a *leading* v if present — a bare "1.2.3" (no v prefix) also
# validates today. Documenting existing behavior, not asserting it is desirable.
expect_accepted '1.2.3' 'tag without the v prefix (TAG#v is a no-op here)'

echo
echo "$((total - failures))/$total checks passed"
if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) FAILED"
  exit 1
fi
echo "all checks passed"
