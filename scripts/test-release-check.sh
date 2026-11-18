#!/usr/bin/env bash
#
# Tests for scripts/previous-stable-tag.sh and scripts/check-release-breaking.sh,
# run against a fixture git history.
#
# Usage: scripts/test-release-check.sh

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

g() { git -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }
commit() { g commit -q --allow-empty -m "$1"; git rev-parse HEAD; }

repo="$work/repo"
mkdir -p "$repo"
cd "$repo"
g init -q -b main

# History on main:
#   c0 (v0.9.0) - c1 (v1.0.0) - b1 [breaking #1] - c2 (v2.0.0, also v2.0.0-rc.1)
#   - b2 [breaking #2] (v2.1.0 tags b2 itself) - c3 (v2.2.0) - b3 [breaking #3]
# Backport line from v1.0.0: p1 (v1.0.1) - b4 [breaking #4 on the 1.x line]
commit c0 >/dev/null
g tag v0.9.0
c1="$(commit c1)"
g tag v1.0.0
b1="$(commit b1)"
commit c2 >/dev/null
g tag v2.0.0-rc.1
g tag -a -m v2.0.0 v2.0.0
b2="$(commit b2)"
g tag v2.1.0
commit c3 >/dev/null
g tag v2.2.0
b3="$(commit b3)"
commit c4 >/dev/null
g tag v2.3.0
g tag v3.0.0
g tag v2.3.1-rc.1
g checkout -q -b release-1.x "$c1"
commit p1 >/dev/null
g tag v1.0.1
b4="$(commit b4)"
g tag v1.1.0
g tag v2.9.0
g checkout -q main

prs="$work/prs.json"
cat >"$prs" <<EOF
[
  {"number": 1, "title": "Break one", "mergeCommit": {"oid": "$b1"}},
  {"number": 2, "title": "Break two", "mergeCommit": {"oid": "$b2"}},
  {"number": 3, "title": "Break three", "mergeCommit": {"oid": "$b3"}},
  {"number": 4, "title": "Break on 1.x", "mergeCommit": {"oid": "$b4"}},
  {"number": 5, "title": "Not in this clone", "mergeCommit": {"oid": "0123456789012345678901234567890123456789"}},
  {"number": 6, "title": "No merge commit", "mergeCommit": null}
]
EOF

# --- previous-stable-tag.sh ----------------------------------------------------
expect_prev() {
  local got
  got="$("$here/previous-stable-tag.sh" "$1" "${3:-}")"
  [ "$got" = "$2" ] || fail "previous-stable-tag $1 ${3:-}: got '$got', want '$2'"
}
expect_prev main v3.0.0
expect_prev "v3.0.0^" v2.2.0 v3.0.0
expect_prev "v2.0.0^" v1.0.0 v2.0.0
expect_prev "v2.0.0-rc.1^" v1.0.0
expect_prev v2.3.1-rc.1 v3.0.0
expect_prev "v1.1.0^" v1.0.1 v1.1.0
expect_prev v0.9.0 "" v0.9.0

# --- check-release-breaking.sh -------------------------------------------------
# expect_release <tag> <0|1> [<text in output>]
expect_release() {
  local out status
  set +e
  out="$(BREAKING_PRS_JSON="$prs" "$here/check-release-breaking.sh" "$1" 2>&1)"
  status=$?
  set -e
  [ "$status" = "$2" ] || fail "release $1: exit $status, want $2: $out"
  if [ -n "${3:-}" ]; then
    case "$out" in *"$3"*) ;; *) fail "release $1: missing '$3' in: $out" ;; esac
  fi
  if [ -n "${4:-}" ]; then
    case "$out" in *"$4"*) fail "release $1: unexpected '$4' in: $out" ;; esac
  fi
}
expect_release v0.9.0 0 "skipping"
expect_release v1.0.0 0 "stabilises"
expect_release v2.0.0 0 "#1 Break one" "#2"
# The release whose tagged commit is the breaking merge counts it once...
expect_release v2.1.0 1 "#2 Break two"
# ...and the next release does not count it again.
expect_release v2.2.0 0 "none" "#2"
expect_release v2.3.0 1 "#3 Break three"
expect_release v3.0.0 0 "#3 Break three" "#2"
# A backport on the 1.x line sees only its own commits.
expect_release v1.0.1 0 "none" "#1"
expect_release v1.1.0 1 "#4 Break on 1.x" "#1"
expect_release v2.9.0 0 "#4 Break on 1.x"
expect_release not-a-tag 1 "not a vX.Y.Z tag"

# --- check-release.sh, before the tag exists -----------------------------------
# A second history, with the files the guards read:
#   r0 (v1.0.0) - rb [breaking #7] - rr (release commit, untagged)
rel="$work/rel"
mkdir -p "$rel"
cd "$rel"
g init -q -b main
write_release() { # <package version> <changelog heading>
  printf '{"name": "x", "version": "%s"}\n' "$1" >package.json
  printf '# Changelog\n\n## [Unreleased]\n\n%s\n' "$2" >CHANGELOG.md
  g add package.json CHANGELOG.md
}
write_release 1.0.0 "## [1.0.0] - 2026-01-01"
g commit -q -m r0
g tag v1.0.0
rb="$(commit rb)"
write_release 2.0.0 "## [2.0.0] - 2026-02-01"
g commit -q -m rr
dated="$(git rev-parse HEAD)"
write_release 2.0.0 "## [2.0.0]"
g commit -q -m "undated heading"
undated_rev="$(git rev-parse HEAD)"
g checkout -q "$dated"
rel_prs="$work/rel-prs.json"
printf '[{"number": 7, "title": "Break seven", "mergeCommit": {"oid": "%s"}}]\n' "$rb" >"$rel_prs"

# expect_check <tag> <rev> <0|1> [<text in output>]
expect_check() {
  local out status
  set +e
  out="$(BREAKING_PRS_JSON="$rel_prs" "$here/check-release.sh" "$1" "$2" 2>&1)"
  status=$?
  set -e
  [ "$status" = "$3" ] || fail "check-release $1 $2: exit $status, want $3: $out"
  if [ -n "${4:-}" ]; then
    case "$out" in *"$4"*) ;; *) fail "check-release $1 $2: missing '$4' in: $out" ;; esac
  fi
}
expect_check v2.0.0 HEAD 0 "#7 Break seven"
# The tag must match package.json, and #7 needs a major bump.
expect_check v1.1.0 HEAD 1 "package.json has version 2.0.0"
expect_check v1.1.0 HEAD 1 "must bump the major version"
expect_check v1.1.0 HEAD 1 "no dated"
expect_check v2.0.0 "$undated_rev" 1 "no dated '## [2.0.0] - YYYY-MM-DD' heading"
expect_check 2.0.0 HEAD 1 "is not a vX.Y.Z"
# Without a rev, the tag is the release, so the check needs the tag to exist.
g tag v2.0.0
expect_check v2.0.0 v2.0.0 0 "#7 Break seven"
cd "$repo"

if [ "$failures" -ne 0 ]; then
  echo "$failures release-check test(s) failed" >&2
  exit 1
fi
echo "release-check tests passed"
