#!/usr/bin/env bash
#
# Check that a release's major version matches the breaking PRs it contains.
#
# Usage: scripts/check-release-breaking.sh <tag>
#
# The release contains the commits in <previous stable tag>..<tag>. A PR
# labelled `breaking` is in the release when its merge commit is an ancestor
# of <tag> but not of the previous tag. Then:
#   - breaking PRs in the release and no major bump: fail
#   - a major bump and no breaking PRs: fail, except 0.x to 1.0.0, because
#     stabilising an API is not a break
#
# Needs the full history and tags (fetch-depth: 0). Reads merged `breaking`
# PRs with `gh` (GH_TOKEN, GITHUB_REPOSITORY), or from the JSON file in
# BREAKING_PRS_JSON, which the tests use. The JSON is a list of
# {number, title, mergeCommit: {oid}} objects.

set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  echo "usage: scripts/check-release-breaking.sh <tag>" >&2
  exit 2
fi
here="$(cd "$(dirname "$0")" && pwd)"

if ! [[ "$tag" =~ ^v([0-9]+)\.[0-9]+\.[0-9]+ ]]; then
  echo "::error::${tag} is not a vX.Y.Z tag"
  exit 1
fi
this_major="${BASH_REMATCH[1]}"

# The root commit has no parent, so there is nothing before it.
parent="$(git rev-parse -q --verify "${tag}^" || true)"
prev=""
if [ -n "$parent" ]; then
  prev="$("$here/previous-stable-tag.sh" "$parent" "$tag")"
fi
if [ -z "$prev" ]; then
  echo "No earlier stable release tag before ${tag}; skipping the breaking-change check."
  exit 0
fi
[[ "$prev" =~ ^v([0-9]+)\. ]]
prev_major="${BASH_REMATCH[1]}"

if [ -n "${BREAKING_PRS_JSON:-}" ]; then
  prs_json="$(cat "$BREAKING_PRS_JSON")"
else
  prs_json="$(gh pr list --repo "$GITHUB_REPOSITORY" --state merged --label breaking \
    --limit 1000 --json number,title,mergeCommit)"
fi

# One "<merge commit>\t#<number> <title>" line per PR.
# shellcheck disable=SC2016 # ${...} below is JavaScript, not shell.
pr_lines="$(PRS="$prs_json" node -e '
  for (const pr of JSON.parse(process.env.PRS)) {
    const oid = pr.mergeCommit && pr.mergeCommit.oid;
    if (oid) console.log(`${oid}\t#${pr.number} ${pr.title}`);
  }
')"

in_release=""
while IFS=$'\t' read -r oid label; do
  [ -n "$oid" ] || continue
  # A merge commit this clone does not have cannot be in the release.
  git cat-file -e "${oid}^{commit}" 2>/dev/null || continue
  if git merge-base --is-ancestor "$oid" "$tag" && ! git merge-base --is-ancestor "$oid" "$prev"; then
    in_release="${in_release}${label}"$'\n'
  fi
done <<<"$pr_lines"

echo "Release ${tag} contains the commits since ${prev}. Breaking PRs in it:"
printf '%s' "${in_release:-  none
}"

if [ -n "$in_release" ] && [ "$this_major" -le "$prev_major" ]; then
  echo "::error::PRs labelled 'breaking' are in ${tag} (since ${prev}), so it must bump the major version."
  exit 1
fi
if [ -z "$in_release" ] && [ "$this_major" -gt "$prev_major" ]; then
  if [ "$prev_major" = "0" ] && [ "$this_major" = "1" ]; then
    echo "${tag} stabilises the 0.x API; no breaking PR is needed."
    exit 0
  fi
  echo "::error::${tag} bumps the major version, but no PR labelled 'breaking' is in it (since ${prev})."
  exit 1
fi
echo "The version of ${tag} matches the breaking PRs it contains."
