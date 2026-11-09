#!/usr/bin/env bash
#
# Tests for scripts/bump-version.sh. Each case runs the script in a scratch
# copy of a small fixture repository.
#
# Usage: scripts/test-bump-version.sh

set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/bump-version.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

# Write a fixture repository at version 1.2.3 into $1.
fixture() {
  local dir="$1"
  mkdir -p "$dir/src"
  cat >"$dir/package.json" <<'EOF'
{
  "name": "fixture",
  "version": "1.2.3"
}
EOF
  cat >"$dir/package-lock.json" <<'EOF'
{
  "name": "fixture",
  "version": "1.2.3",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "fixture",
      "version": "1.2.3"
    }
  }
}
EOF
  echo "export const VERSION = '1.2.3';" >"$dir/src/version.ts"
  cat >"$dir/CHANGELOG.md" <<'EOF'
# Changelog

## [Unreleased]

### Added

- A new thing.

## [1.2.3] - 2026-01-01

### Fixed

- An old thing.

[unreleased]: https://github.com/example/repo/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/example/repo/compare/v1.2.2...v1.2.3
EOF
}

# run <dir> <part> -> sets $out and $status
run() {
  set +e
  out="$(cd "$1" && BUMP_DATE=2026-11-09 bash "$script" "$2" 2>&1)"
  status=$?
  set -e
}

# --- each part bumps the right component ------------------------------------
for case in "major 2.0.0" "minor 1.3.0" "patch 1.2.4"; do
  read -r part want <<<"$case"
  dir="$work/$part"
  fixture "$dir"
  run "$dir" "$part"
  [ "$status" = 0 ] || fail "$part: exit $status: $out"
  [ "$out" = "$want" ] || fail "$part: printed '$out', want '$want'"
  [ "$(cd "$dir" && node -p "require('./package.json').version")" = "$want" ] ||
    fail "$part: package.json not updated"
  [ "$(cd "$dir" && node -p "require('./package-lock.json').version")" = "$want" ] ||
    fail "$part: package-lock.json version not updated"
  [ "$(cd "$dir" && node -p "require('./package-lock.json').packages[''].version")" = "$want" ] ||
    fail "$part: package-lock.json root package not updated"
  grep -qxF "export const VERSION = '$want';" "$dir/src/version.ts" ||
    fail "$part: src/version.ts not updated"
done

# --- changelog layout after a minor bump ------------------------------------
expected="$work/expected.md"
cat >"$expected" <<'EOF'
# Changelog

## [Unreleased]

## [1.3.0] - 2026-11-09

### Added

- A new thing.

## [1.2.3] - 2026-01-01

### Fixed

- An old thing.

[unreleased]: https://github.com/example/repo/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/example/repo/compare/v1.2.3...v1.3.0
[1.2.3]: https://github.com/example/repo/compare/v1.2.2...v1.2.3
EOF
diff -u "$expected" "$work/minor/CHANGELOG.md" >&2 || fail "minor: CHANGELOG.md layout"

# --- running again with nothing unreleased fails and changes nothing --------
before="$(cat "$work/minor/package.json" "$work/minor/CHANGELOG.md" "$work/minor/src/version.ts")"
run "$work/minor" patch
[ "$status" != 0 ] || fail "second run: expected failure, got success"
case "$out" in *"nothing to release"*) ;; *) fail "second run: unexpected message: $out" ;; esac
after="$(cat "$work/minor/package.json" "$work/minor/CHANGELOG.md" "$work/minor/src/version.ts")"
[ "$before" = "$after" ] || fail "second run: files changed"

# --- bad arguments and unexpected shapes fail clearly -----------------------
dir="$work/badarg"
fixture "$dir"
run "$dir" huge
[ "$status" != 0 ] || fail "bad argument: expected failure"
case "$out" in *usage:*) ;; *) fail "bad argument: unexpected message: $out" ;; esac

dir="$work/version-ts"
fixture "$dir"
echo "export const VERSION = '9.9.9';" >"$dir/src/version.ts"
run "$dir" patch
[ "$status" != 0 ] || fail "mismatched version.ts: expected failure"
case "$out" in *src/version.ts*) ;; *) fail "mismatched version.ts: unexpected message: $out" ;; esac
grep -qF '"version": "1.2.3"' "$dir/package.json" || fail "mismatched version.ts: package.json changed"

dir="$work/no-link"
fixture "$dir"
grep -v '^\[unreleased\]' "$dir/CHANGELOG.md" >"$dir/c" && mv "$dir/c" "$dir/CHANGELOG.md"
run "$dir" patch
[ "$status" != 0 ] || fail "missing unreleased link: expected failure"
case "$out" in *"[unreleased]"*) ;; *) fail "missing unreleased link: unexpected message: $out" ;; esac

if [ "$failures" -ne 0 ]; then
  echo "$failures bump-version test(s) failed" >&2
  exit 1
fi
echo "bump-version tests passed"
