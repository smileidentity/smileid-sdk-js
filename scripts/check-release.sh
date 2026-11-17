#!/usr/bin/env bash
#
# Run the release guards for a tag: the tag is a version, package.json has
# that version, CHANGELOG.md has a dated heading for it, and the major
# version matches the breaking PRs it contains.
#
# Usage: scripts/check-release.sh <tag> [<rev>]
#
# release.yml runs it on the pushed tag. The release-guards job in
# quality-gates.yml runs it on a release pull request, before the tag exists,
# with <rev> set to the pull request's merge commit. A failed guard on a
# pushed tag burns that version, because tags cannot be moved, so the pull
# request check catches the same problems first.
#
# Run it from the repository root, with the full history and tags.

set -euo pipefail

tag="${1:-}"
rev="${2:-$tag}"
if [ -z "$tag" ]; then
  echo "usage: scripts/check-release.sh <tag> [<rev>]" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"
status=0

if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "::error::${tag} is not a vX.Y.Z or vX.Y.Z-prerelease tag"
  exit 1
fi
version="${tag#v}"

pkg_version="$(git show "${rev}:package.json" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => console.log(JSON.parse(s).version));
')"
if [ "$pkg_version" != "$version" ]; then
  echo "::error::package.json has version ${pkg_version}, but the release is ${tag}. Run scripts/bump-version.sh."
  status=1
else
  echo "package.json has version ${version}."
fi

# The heading bump-version.sh writes: "## [X.Y.Z] - YYYY-MM-DD".
heading_re="^## \\[${version//./\\.}\\] - [0-9]{4}-[0-9]{2}-[0-9]{2}\$"
if ! git show "${rev}:CHANGELOG.md" | grep -qE "$heading_re"; then
  echo "::error::CHANGELOG.md has no dated '## [${version}] - YYYY-MM-DD' heading for ${tag}."
  status=1
else
  echo "CHANGELOG.md has a dated heading for ${version}."
fi

"$here/check-release-breaking.sh" "$tag" "$rev" || status=1

exit "$status"
