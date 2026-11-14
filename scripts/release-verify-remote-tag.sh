#!/usr/bin/env bash
# Check that a release tag on the remote still points at the commit that was tested
# (AUS-401).
#
# Usage: release-verify-remote-tag.sh TAG SHA [REMOTE]
#
# The release job runs this before it touches signing material and again just before
# publishing. A tag moved, or deleted, after the gates resolved it fails the release
# instead of publishing a tested APK under a tag that now names a different commit.
set -euo pipefail

TAG="${1:?usage: release-verify-remote-tag.sh TAG SHA [REMOTE]}"
SHA="${2:?usage: release-verify-remote-tag.sh TAG SHA [REMOTE]}"
REMOTE="${3:-origin}"

# An annotated tag lists twice: the tag object, then "refs/tags/TAG^{}" with the commit
# it points at. A lightweight tag lists once, with the commit itself.
if ! REFS=$(git ls-remote --tags "$REMOTE" "refs/tags/$TAG" "refs/tags/$TAG^{}"); then
  echo "::error::Could not read tag $TAG from $REMOTE." >&2
  exit 1
fi

PEELED=$(printf '%s\n' "$REFS" | awk -v r="refs/tags/$TAG^{}" '$2 == r { print $1 }')
DIRECT=$(printf '%s\n' "$REFS" | awk -v r="refs/tags/$TAG" '$2 == r { print $1 }')
REMOTE_SHA="${PEELED:-$DIRECT}"

if [ -z "$REMOTE_SHA" ]; then
  echo "::error::Tag $TAG no longer exists on $REMOTE." >&2
  exit 1
fi
if [ "$REMOTE_SHA" != "$SHA" ]; then
  echo "::error::Tag $TAG moved to $REMOTE_SHA after the gates tested $SHA. Refusing to publish." >&2
  exit 1
fi
echo "tag $TAG still points at $SHA"
