#!/usr/bin/env bash
# Resolve a release tag to the one commit every release job builds (AUS-401).
#
# Usage: release-resolve-tag.sh TAG [EXPECTED_SHA]
# Prints the commit SHA on stdout. Run it in a full clone (fetch-depth: 0) so the tags
# and origin/main are present.
#
# Before this, each release job checked out the tag by name on its own. A tag moved
# while the gates ran would have the signing job build a commit no gate had tested.
# Now the tag is resolved once, here, and every job checks out this exact SHA.
#
# - TAG must be vMAJOR.MINOR.PATCH, checked against the whole string (see CI-3).
# - It is looked up as refs/tags/TAG, so a branch with the same name cannot stand in.
# - Annotated tags are peeled to their commit.
# - EXPECTED_SHA, when given (the commit a tag push triggered on), must be that same
#   commit. If not, the tag moved after the push.
# - The commit must be on origin/main (v2.1.3 was first tagged on a stale branch).
set -euo pipefail

TAG="${1:-}"
EXPECTED_SHA="${2:-}"

if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::Tag '$TAG' is not vMAJOR.MINOR.PATCH" >&2
  exit 1
fi

if ! SHA=$(git rev-parse --verify --quiet "refs/tags/$TAG^{commit}"); then
  echo "::error::Tag $TAG does not exist. Push the tag before running the release." >&2
  exit 1
fi

if [ -n "$EXPECTED_SHA" ]; then
  if ! EXPECTED_COMMIT=$(git rev-parse --verify --quiet "$EXPECTED_SHA^{commit}"); then
    echo "::error::The triggering commit $EXPECTED_SHA is not in this clone." >&2
    exit 1
  fi
  if [ "$SHA" != "$EXPECTED_COMMIT" ]; then
    echo "::error::Tag $TAG now points at $SHA, but the push that started this run was for $EXPECTED_COMMIT. The tag moved; push it again to release." >&2
    exit 1
  fi
fi

if ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "::error::The tagged commit $(git rev-parse --short "$SHA") is not on main. Tag a commit that has been merged to main." >&2
  exit 1
fi

echo "$SHA"
