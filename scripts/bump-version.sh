#!/usr/bin/env bash
#
# Bump the SDK version and cut the changelog's Unreleased section.
#
# Usage: scripts/bump-version.sh <major|minor|patch>
#
# Run from the repository root. Updates:
#   - package.json and package-lock.json ("version")
#   - src/version.ts (VERSION)
#   - CHANGELOG.md: moves the Unreleased entries under a new
#     "## [x.y.z] - YYYY-MM-DD" heading, leaves an empty Unreleased section,
#     and updates the compare links at the bottom.
#
# Prints the new version on stdout. Fails without changing anything if there
# is nothing unreleased or a file is not in the expected shape.
#
# BUMP_DATE (YYYY-MM-DD) overrides today's UTC date; the tests use it.

set -euo pipefail

die() {
  echo "bump-version: $*" >&2
  exit 1
}

part="${1:-}"
case "$part" in
  major | minor | patch) ;;
  *) die "usage: scripts/bump-version.sh <major|minor|patch>" ;;
esac

for f in package.json package-lock.json src/version.ts CHANGELOG.md; do
  [ -f "$f" ] || die "$f not found (run from the repository root)"
done

current="$(node -p "require('./package.json').version")"
if ! [[ "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  die "package.json version '$current' is not a plain x.y.z version"
fi
major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
case "$part" in
  major) next="$((major + 1)).0.0" ;;
  minor) next="${major}.$((minor + 1)).0" ;;
  patch) next="${major}.${minor}.$((patch + 1))" ;;
esac

today="${BUMP_DATE:-$(date -u +%Y-%m-%d)}"
[[ "$today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "BUMP_DATE '$today' is not YYYY-MM-DD"

# ---- shape checks (nothing is written until all of these pass) -------------

grep -qxF "export const VERSION = '${current}';" src/version.ts ||
  die "src/version.ts does not contain: export const VERSION = '${current}';"

lock_version="$(node -p "require('./package-lock.json').version")"
[ "$lock_version" = "$current" ] ||
  die "package-lock.json version '$lock_version' does not match package.json '$current'"

[ "$(grep -cxF '## [Unreleased]' CHANGELOG.md)" = "1" ] ||
  die "CHANGELOG.md must have exactly one '## [Unreleased]' heading"

grep -qF "## [${next}]" CHANGELOG.md && die "CHANGELOG.md already has a ## [${next}] heading"

# Unreleased entries: non-blank lines between "## [Unreleased]" and the next
# "## " heading or link reference block.
unreleased="$(awk '
  $0 == "## [Unreleased]" { inside = 1; next }
  inside && (/^## / || /^\[[^]]+\]: /) { exit }
  inside && NF { print }
' CHANGELOG.md)"
[ -n "$unreleased" ] || die "CHANGELOG.md has nothing under ## [Unreleased]; nothing to release"

unreleased_link_re='^\[[Uu]nreleased\]: (.*)/compare/v[^.]+\.[^.]+\.[^.]+\.\.\.HEAD$'
link_line="$(grep -E "$unreleased_link_re" CHANGELOG.md || true)"
[ "$(printf '%s\n' "$link_line" | grep -c .)" = "1" ] ||
  die "CHANGELOG.md must have exactly one '[unreleased]: <repo>/compare/vX.Y.Z...HEAD' link"
[[ "$link_line" =~ $unreleased_link_re ]]
repo_url="${BASH_REMATCH[1]}"

# ---- write -----------------------------------------------------------------

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

awk -v next_ver="$next" -v today="$today" -v repo="$repo_url" -v cur="$current" '
  $0 == "## [Unreleased]" {
    print
    print ""
    print "## [" next_ver "] - " today
    next
  }
  /^\[[Uu]nreleased\]: / {
    label = substr($0, 2, index($0, "]") - 2)
    print "[" label "]: " repo "/compare/v" next_ver "...HEAD"
    print "[" next_ver "]: " repo "/compare/v" cur "...v" next_ver
    next
  }
  { print }
' CHANGELOG.md >"$tmp"
cat "$tmp" >CHANGELOG.md

NEXT_VERSION="$next" node -e '
  const fs = require("fs");
  const next = process.env.NEXT_VERSION;
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = next;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.version = next;
  if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
  fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
'

sed "s/^export const VERSION = '${current//./\\.}';\$/export const VERSION = '${next}';/" src/version.ts >"$tmp"
cat "$tmp" >src/version.ts

echo "$next"
