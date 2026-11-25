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
  mkdir -p "$dir/example"
  cat >"$dir/example/package-lock.json" <<'EOF'
{
  "name": "fixture-example",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "fixture-example",
      "version": "0.1.0",
      "dependencies": {
        "fixture": "file:.."
      }
    },
    "..": {
      "name": "fixture",
      "version": "1.2.3"
    },
    "node_modules/fixture": {
      "resolved": "..",
      "link": true
    },
    "node_modules/other": {
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

# check_bumped <label> <dir> <want>: every versioned file is at <want>.
check_bumped() {
  local label="$1" dir="$2" want="$3"
  [ "$(cd "$dir" && node -p "require('./package.json').version")" = "$want" ] ||
    fail "$label: package.json not updated"
  [ "$(cd "$dir" && node -p "require('./package-lock.json').version")" = "$want" ] ||
    fail "$label: package-lock.json version not updated"
  [ "$(cd "$dir" && node -p "require('./package-lock.json').packages[''].version")" = "$want" ] ||
    fail "$label: package-lock.json root package not updated"
  [ "$(cd "$dir" && node -p "require('./example/package-lock.json').packages['..'].version")" = "$want" ] ||
    fail "$label: example/package-lock.json SDK entry not updated"
  [ "$(cd "$dir" && node -p "require('./example/package-lock.json').packages[''].version")" = "0.1.0" ] ||
    fail "$label: example/package-lock.json root package changed"
  [ "$(cd "$dir" && node -p "require('./example/package-lock.json').packages['node_modules/other'].version")" = "1.2.3" ] ||
    fail "$label: example/package-lock.json unrelated package changed"
  grep -qxF "export const VERSION = '$want';" "$dir/src/version.ts" ||
    fail "$label: src/version.ts not updated"
}

# snapshot <dir>: the contents of every file the script may write.
snapshot() {
  (cd "$1" && cat package.json package-lock.json example/package-lock.json CHANGELOG.md src/version.ts)
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
  check_bumped "$part" "$dir" "$want"
done

# --- an exact version is set as given, skipping any in between --------------
for want in 1.2.4 1.2.10 1.3.0 13.3.0; do
  dir="$work/exact-$want"
  fixture "$dir"
  run "$dir" "$want"
  [ "$status" = 0 ] || fail "exact $want: exit $status: $out"
  [ "$out" = "$want" ] || fail "exact $want: printed '$out', want '$want'"
  check_bumped "exact $want" "$dir" "$want"
  grep -qxF "## [$want] - 2026-11-09" "$dir/CHANGELOG.md" || fail "exact $want: no changelog heading"
  grep -qxF "[$want]: https://github.com/example/repo/compare/v1.2.3...v$want" "$dir/CHANGELOG.md" ||
    fail "exact $want: no changelog compare link"
  grep -qxF "[unreleased]: https://github.com/example/repo/compare/v$want...HEAD" "$dir/CHANGELOG.md" ||
    fail "exact $want: unreleased link not moved"
done

# An exact version produces the same result as the matching part.
diff -r "$work/minor" "$work/exact-1.3.0" >&2 || fail "exact 1.3.0: differs from a minor bump"

# --- an exact version that is not greater, or not plain X.Y.Z, fails --------
for bad in 1.2.3 1.2.2 1.1.9 0.9.9; do
  dir="$work/not-greater-$bad"
  fixture "$dir"
  before="$(snapshot "$dir")"
  run "$dir" "$bad"
  [ "$status" != 0 ] || fail "not greater $bad: expected failure"
  case "$out" in *"not greater than the current version 1.2.3"*) ;; *) fail "not greater $bad: unexpected message: $out" ;; esac
  [ "$before" = "$(snapshot "$dir")" ] || fail "not greater $bad: files changed"
done

for bad in 1.3 1.3.0.0 v1.3.0 1.03.0 1.3.0-rc.1 1.3.0+build 2.0.x; do
  dir="$work/malformed"
  rm -rf "$dir"
  fixture "$dir"
  before="$(snapshot "$dir")"
  run "$dir" "$bad"
  [ "$status" != 0 ] || fail "malformed $bad: expected failure"
  case "$out" in *usage:*) ;; *) fail "malformed $bad: unexpected message: $out" ;; esac
  [ "$before" = "$(snapshot "$dir")" ] || fail "malformed $bad: files changed"
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
before="$(snapshot "$work/minor")"
run "$work/minor" patch
[ "$status" != 0 ] || fail "second run: expected failure, got success"
case "$out" in *"nothing to release"*) ;; *) fail "second run: unexpected message: $out" ;; esac
[ "$before" = "$(snapshot "$work/minor")" ] || fail "second run: files changed"

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

dir="$work/example-lock"
fixture "$dir"
sed 's/"version": "1.2.3"$/"version": "1.2.2"/' "$dir/example/package-lock.json" >"$dir/l" &&
  mv "$dir/l" "$dir/example/package-lock.json"
before="$(snapshot "$dir")"
run "$dir" patch
[ "$status" != 0 ] || fail "stale example lockfile: expected failure"
case "$out" in *"example/package-lock.json"*"..@1.2.2"*) ;; *) fail "stale example lockfile: unexpected message: $out" ;; esac
[ "$before" = "$(snapshot "$dir")" ] || fail "stale example lockfile: files changed"

dir="$work/example-no-sdk"
fixture "$dir"
echo '{"name": "x", "lockfileVersion": 3, "packages": {"": {"name": "x"}}}' >"$dir/example/package-lock.json"
run "$dir" patch
[ "$status" != 0 ] || fail "example lockfile without SDK: expected failure"
case "$out" in *"no entry for the local SDK package"*) ;; *) fail "example lockfile without SDK: unexpected message: $out" ;; esac

dir="$work/no-link"
fixture "$dir"
grep -v '^\[unreleased\]' "$dir/CHANGELOG.md" >"$dir/c" && mv "$dir/c" "$dir/CHANGELOG.md"
run "$dir" patch
[ "$status" != 0 ] || fail "missing unreleased link: expected failure"
case "$out" in *"[unreleased]"*) ;; *) fail "missing unreleased link: unexpected message: $out" ;; esac

# --- a failure while writing leaves every file unchanged --------------------
dir="$work/atomic"
fixture "$dir"
shim="$work/shim"
mkdir -p "$shim"
real_node="$(command -v node)"
# A node that answers -p queries but fails when asked to write the JSON files.
cat >"$shim/node" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "-e" ]; then echo "simulated write failure" >&2; exit 1; fi
exec "$real_node" "\$@"
EOF
chmod +x "$shim/node"
before="$(snapshot "$dir")"
set +e
out="$(cd "$dir" && PATH="$shim:$PATH" BUMP_DATE=2026-11-09 bash "$script" minor 2>&1)"
status=$?
set -e
[ "$status" != 0 ] || fail "atomic: expected failure, got success: $out"
[ "$before" = "$(snapshot "$dir")" ] || fail "atomic: files changed after a failed write"

if [ "$failures" -ne 0 ]; then
  echo "$failures bump-version test(s) failed" >&2
  exit 1
fi
echo "bump-version tests passed"
