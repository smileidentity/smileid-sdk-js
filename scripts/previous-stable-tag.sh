#!/usr/bin/env bash
#
# Print the newest stable release tag (vX.Y.Z, no pre-release suffix) that is
# an ancestor of a revision, or nothing if there is none.
#
# Usage: scripts/previous-stable-tag.sh <rev> [<tag-to-skip>]
#
# api-compat passes the PR's base branch. The release workflow passes the
# parent of the tagged commit and the new tag, so the new tag never counts
# as its own predecessor.

set -euo pipefail

rev="${1:-}"
skip="${2:-}"
if [ -z "$rev" ]; then
  echo "usage: scripts/previous-stable-tag.sh <rev> [<tag-to-skip>]" >&2
  exit 2
fi

# Only tags reachable from rev, so a backport on an older line sees its own
# line. Sorted by version, so the newest stable one is last. tail reads all
# of its input, so nothing upstream is killed by SIGPIPE.
tags="$(git tag --merged "$rev" --list 'v*')"
stable="$(printf '%s\n' "$tags" | { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } |
  { grep -vxF -- "${skip:-/}" || true; } | sort -V | tail -n 1)"
printf '%s\n' "$stable" | { grep . || true; }
