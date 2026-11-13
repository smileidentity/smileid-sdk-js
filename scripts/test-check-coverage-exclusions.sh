#!/usr/bin/env bash
#
# Tests for scripts/check-coverage-exclusions.sh, run against small fixture
# git repositories.
#
# Usage: scripts/test-check-coverage-exclusions.sh

set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/check-coverage-exclusions.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

fail() {
  echo "FAIL: $*" >&2
  failures=$((failures + 1))
}

g() { git -c user.name=t -c user.email=t@example.com -c commit.gpgsign=false "$@"; }

# new_repo <dir>: a repo with one base commit, tagged "base".
new_repo() {
  mkdir -p "$1/src/generated"
  (
    cd "$1"
    g init -q
    echo 'a' >src/a.ts
    printf '{\n  "name": "x",\n  "scripts": { "test": "node --test", "coverage": "c8 node --test" },\n  "devDependencies": { "c8": "^11.0.0" }\n}\n' >package.json
    printf '<project><plugin>jacoco</plugin></project>\n' >pom.xml
    echo 'x' >build.gradle
    g add -A
    g commit -qm base
    g tag base
  )
}

# check <dir> -> sets $out and $status
check() {
  set +e
  out="$(cd "$1" && bash "$script" base 2>&1)"
  status=$?
  set -e
}

commit_all() { (cd "$1" && g add -A && g commit -qm change); }

# --- every marker is found, with the right file and line ---------------------
dir="$work/markers"
new_repo "$dir"
cat >"$dir/src/a.ts" <<'EOF'
a
/* c8 ignore next */
// istanbul ignore else
x = 1 # pragma: no cover
# :nocov:
/** @codeCoverageIgnore */
#[coverage(off)]
@Generated
clean line
EOF
echo '@Generated("x")' >"$dir/src/generated/ok.java"
echo '- c8 ignore is described here' >"$dir/doc.md"
printf '<project><plugin>jacoco</plugin>\n<excludes><exclude>**/Foo*</exclude></excludes></project>\n' >"$dir/pom.xml"
echo "excludes = ['x']" >>"$dir/build.gradle"
commit_all "$dir"
check "$dir"
[ "$status" = 1 ] || fail "markers: exit $status"
for want in "src/a.ts:2:" "src/a.ts:3:" "src/a.ts:4:" "src/a.ts:5:" "src/a.ts:6:" "src/a.ts:7:" \
  "src/a.ts:8: @Generated outside generated/" "pom.xml:2: possible JaCoCo exclusion"; do
  case "$out" in *"$want"*) ;; *) fail "markers: missing '$want' in: $out" ;; esac
done
for unwanted in "ok.java" "doc.md" "build.gradle" "src/a.ts:9:"; do
  case "$out" in *"$unwanted"*) fail "markers: unexpected '$unwanted' in: $out" ;; esac
done

# --- an added line starting with "++ " does not switch the file --------------
dir="$work/plusplus"
new_repo "$dir"
printf 'a\n++ counter\n// c8 ignore next\n' >"$dir/src/a.ts"
commit_all "$dir"
check "$dir"
[ "$status" = 1 ] || fail "plusplus: exit $status"
case "$out" in *"src/a.ts:3: coverage exclusion marker"*) ;; *) fail "plusplus: wrong report: $out" ;; esac

# --- a removed line starting with "-- " does not confuse the parser ----------
dir="$work/minusminus"
new_repo "$dir"
printf -- '-- old\nkeep\n' >"$dir/src/b.ts"
commit_all "$dir"
(cd "$dir" && g tag -f base >/dev/null)
printf 'keep\n// c8 ignore next\n' >"$dir/src/b.ts"
commit_all "$dir"
check "$dir"
case "$out" in *"src/b.ts:2: coverage exclusion marker"*) ;; *) fail "minusminus: wrong report: $out" ;; esac

# --- coverage config changes are flagged --------------------------------------
dir="$work/c8rc"
new_repo "$dir"
echo '{ "exclude": ["src/generated/**"] }' >"$dir/.c8rc.json"
commit_all "$dir"
check "$dir"
[ "$status" = 1 ] || fail "c8rc: exit $status"
case "$out" in *".c8rc.json: coverage config changed"*) ;; *) fail "c8rc: $out" ;; esac

dir="$work/pkg-c8"
new_repo "$dir"
printf '{\n  "name": "x",\n  "scripts": { "test": "node --test", "coverage": "c8 node --test" },\n  "devDependencies": { "c8": "^11.0.0" },\n  "c8": { "exclude": ["src/**"] }\n}\n' >"$dir/package.json"
commit_all "$dir"
check "$dir"
case "$out" in *"package.json: coverage config changed (c8)"*) ;; *) fail "pkg-c8: $out" ;; esac

dir="$work/pkg-script"
new_repo "$dir"
printf '{\n  "name": "x",\n  "scripts": { "test": "node --test", "coverage": "c8 --lines 50 node --test" },\n  "devDependencies": { "c8": "^11.0.0" }\n}\n' >"$dir/package.json"
commit_all "$dir"
check "$dir"
case "$out" in *"package.json: coverage config changed (scripts)"*) ;; *) fail "pkg-script: $out" ;; esac

# --- a c8 dependency bump or an unrelated script change is fine ---------------
dir="$work/pkg-dep"
new_repo "$dir"
printf '{\n  "name": "x",\n  "scripts": { "test": "node --test --x", "coverage": "c8 node --test" },\n  "devDependencies": { "c8": "^11.0.1" }\n}\n' >"$dir/package.json"
commit_all "$dir"
check "$dir"
[ "$status" = 0 ] || fail "pkg-dep: exit $status: $out"

# --- usage ---------------------------------------------------------------------
set +e
out="$(bash "$script" 2>&1)"
status=$?
set -e
[ "$status" = 2 ] || fail "usage: exit $status"

if [ "$failures" -ne 0 ]; then
  echo "$failures check-coverage-exclusions test(s) failed" >&2
  exit 1
fi
echo "check-coverage-exclusions tests passed"
