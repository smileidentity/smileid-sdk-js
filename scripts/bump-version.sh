#!/usr/bin/env bash
#
# Bump the SDK version and cut the changelog's Unreleased section.
#
# Usage: scripts/bump-version.sh <major|minor|patch|X.Y.Z>
#
# A part bumps that component of the current version. An exact X.Y.Z (plain
# digits, no pre-release or build suffix) sets that version; it must be
# greater than the current one. The release train uses it so every SDK lands
# on the shared version even when one skipped a release.
#
# Run from the repository root. Updates:
#   - package.json and package-lock.json ("version")
#   - example/package-lock.json: the version of the local SDK package entry
#     (the example depends on the SDK via "file:..")
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

usage="usage: scripts/bump-version.sh <major|minor|patch|X.Y.Z>"
semver_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
part="${1:-}"
case "$part" in
  major | minor | patch) ;;
  [0-9]*)
    [[ "$part" =~ $semver_re ]] ||
      die "'$part' is not a plain X.Y.Z version (digits only, no leading zeros or suffix); $usage"
    ;;
  *) die "$usage" ;;
esac

for f in package.json package-lock.json example/package-lock.json src/version.ts CHANGELOG.md; do
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
  *)
    [[ "$part" =~ $semver_re ]]
    if ((BASH_REMATCH[1] < major ||
      (BASH_REMATCH[1] == major && BASH_REMATCH[2] < minor) ||
      (BASH_REMATCH[1] == major && BASH_REMATCH[2] == minor && BASH_REMATCH[3] <= patch))); then
      die "version $part is not greater than the current version $current"
    fi
    next="$part"
    ;;
esac

today="${BUMP_DATE:-$(date -u +%Y-%m-%d)}"
[[ "$today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "BUMP_DATE '$today' is not YYYY-MM-DD"

# ---- shape checks (nothing is written until all of these pass) -------------

grep -qxF "export const VERSION = '${current}';" src/version.ts ||
  die "src/version.ts does not contain: export const VERSION = '${current}';"

lock_version="$(node -p "require('./package-lock.json').version")"
[ "$lock_version" = "$current" ] ||
  die "package-lock.json version '$lock_version' does not match package.json '$current'"

sdk_name="$(node -p "require('./package.json').name")"
# The local SDK entries in the example lockfile ("..", from "file:..") must be
# at the current version: prints their count, or "stale <key@version, ...>".
example_entries="$(SDK_NAME="$sdk_name" CURRENT="$current" node -p '
  const lock = JSON.parse(require("fs").readFileSync("example/package-lock.json", "utf8"));
  const entries = Object.entries(lock.packages || {}).filter(
    ([key, p]) => !key.startsWith("node_modules/") && p.name === process.env.SDK_NAME,
  );
  const stale = entries.filter(([, p]) => p.version !== process.env.CURRENT);
  stale.length ? "stale " + stale.map(([k, p]) => k + "@" + p.version).join(", ") : entries.length;
')"
case "$example_entries" in
  stale*) die "example/package-lock.json SDK entry does not match package.json '$current': ${example_entries#stale }" ;;
  0) die "example/package-lock.json has no entry for the local SDK package '$sdk_name'" ;;
esac

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

# Write every new file to a temporary directory first, then copy them all into
# place, so a failure part-way leaves the repository unchanged.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

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
' CHANGELOG.md >"$tmp/CHANGELOG.md"

NEXT_VERSION="$next" OUT="$tmp" SDK_NAME="$sdk_name" node -e '
  const fs = require("fs");
  const path = require("path");
  const next = process.env.NEXT_VERSION;
  const out = process.env.OUT;
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = next;
  fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.version = next;
  if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
  fs.writeFileSync(path.join(out, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  // The example installs the SDK from "file:..", so its lockfile records the
  // SDK version under the local package entry (key ".."). Update only that
  // entry, not registry packages.
  const ex = JSON.parse(fs.readFileSync("example/package-lock.json", "utf8"));
  for (const [key, p] of Object.entries(ex.packages || {})) {
    if (!key.startsWith("node_modules/") && p.name === process.env.SDK_NAME) p.version = next;
  }
  fs.writeFileSync(path.join(out, "example-package-lock.json"), JSON.stringify(ex, null, 2) + "\n");
'

sed "s/^export const VERSION = '${current//./\\.}';\$/export const VERSION = '${next}';/" src/version.ts >"$tmp/version.ts"
grep -qxF "export const VERSION = '${next}';" "$tmp/version.ts" || die "could not update src/version.ts"

# cp (not mv) keeps each file's existing permissions.
cp "$tmp/package.json" package.json
cp "$tmp/package-lock.json" package-lock.json
cp "$tmp/example-package-lock.json" example/package-lock.json
cp "$tmp/version.ts" src/version.ts
cp "$tmp/CHANGELOG.md" CHANGELOG.md

echo "$next"
