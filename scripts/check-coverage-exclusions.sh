#!/usr/bin/env bash
#
# Fail if the current branch adds a coverage exclusion.
#
# Usage: scripts/check-coverage-exclusions.sh <base-ref>
#
# Scans the lines added in `git diff <base-ref>...HEAD` for coverage
# exclusion markers used across the Smile ID SDKs, prints each hit as
# file:line, and exits 1 if there are any. Markdown files and this script are
# not scanned, so docs can describe the markers.
#
# Changes to the coverage configuration also count, because they can widen
# what is excluded or lower the thresholds: a c8 or nyc config file, the "c8"
# or "nyc" keys in package.json, or the coverage scripts in package.json.

set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "usage: scripts/check-coverage-exclusions.sh <base-ref>" >&2
  exit 2
fi

self="scripts/check-coverage-exclusions.sh"

# Markers that exclude code from coverage in any of the SDK languages.
# Bracket expressions instead of backslashes, because awk -v rewrites escapes.
markers='nocov|pragma: *no cover|c8 ignore|istanbul ignore|@codeCoverageIgnore|#[[]coverage[(]off[)][]]'

diff_file="$(mktemp)"
trap 'rm -f "$diff_file"' EXIT
git diff --unified=0 --no-color --no-ext-diff "${base}...HEAD" >"$diff_file"

hits="$(
  awk -v markers="$markers" -v self="$self" '
    # A file header is "--- " then "+++ ", outside a hunk. Inside a hunk, an
    # added line whose text starts with "++ " also begins with "+++ ".
    /^diff --git / { in_hunk = 0; saw_minus = 0; next }
    !in_hunk && /^--- / { saw_minus = 1; next }
    !in_hunk && saw_minus && /^\+\+\+ / {
      file = substr($0, 5)
      sub(/^b\//, "", file)
      saw_minus = 0
      next
    }
    /^@@ / {
      # @@ -a,b +c,d @@ : the next added line is line c of the new file.
      in_hunk = 1
      split($3, plus, ",")
      line = substr(plus[1], 2) + 0
      next
    }
    in_hunk && /^\+/ {
      text = substr($0, 2)
      skip = (file == self || file ~ /\.md$/ || file == "/dev/null")
      if (!skip) {
        hit = ""
        if (text ~ markers) {
          hit = "coverage exclusion marker"
        } else if (text ~ /@Generated([^A-Za-z]|$)/ && file !~ /(^|\/)generated\//) {
          # JaCoCo skips classes annotated @Generated.
          hit = "@Generated outside generated/"
        } else if (text ~ /<excludes?>|(^|[^A-Za-z])excludes?[ \t]*[(=+]/ &&
                   (file ~ /(^|\/)pom\.xml$/ || file ~ /\.gradle(\.kts)?$/)) {
          hit = "possible JaCoCo exclusion"
        }
        if (hit != "") printf "%s:%d: %s: %s\n", file, line, hit, text
      }
      line++
      next
    }
  ' "$diff_file"
)"

# Report build-file exclusions only when the build file configures JaCoCo.
filtered=""
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  case "$hit" in
    *": possible JaCoCo exclusion: "*)
      file="${hit%%:*}"
      content="$(git show "HEAD:${file}" 2>/dev/null || true)"
      case "$content" in
        *[Jj][Aa][Cc][Oo][Cc][Oo]*) ;;
        *) continue ;;
      esac
      ;;
  esac
  filtered="${filtered}${hit}"$'\n'
done <<<"$hits"

# Coverage config files.
while IFS= read -r file; do
  [ -n "$file" ] || continue
  filtered="${filtered}${file}: coverage config changed"$'\n'
done <<<"$(git diff --name-only "${base}...HEAD" -- \
  .c8rc .c8rc.json .c8rc.yml .c8rc.yaml .nycrc .nycrc.json .nycrc.yml .nycrc.yaml)"

# Coverage settings inside package.json.
if [ -n "$(git diff --name-only "${base}...HEAD" -- package.json)" ]; then
  merge_base="$(git merge-base "$base" HEAD)"
  old_pkg="$(git show "${merge_base}:package.json" 2>/dev/null || echo '{}')"
  new_pkg="$(git show "HEAD:package.json" 2>/dev/null || echo '{}')"
  changed="$(OLD="$old_pkg" NEW="$new_pkg" node -e '
    const pick = (text) => {
      const p = JSON.parse(text);
      const scripts = p.scripts || {};
      return {
        c8: p.c8,
        nyc: p.nyc,
        scripts: Object.fromEntries(
          Object.entries(scripts).filter(([k, v]) => /cover/.test(k) || /\b(c8|nyc)\b/.test(v)),
        ),
      };
    };
    const a = pick(process.env.OLD);
    const b = pick(process.env.NEW);
    for (const key of ["c8", "nyc", "scripts"]) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) console.log(key);
    }
  ')"
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    filtered="${filtered}package.json: coverage config changed (${key})"$'\n'
  done <<<"$changed"
fi

if [ -n "$filtered" ]; then
  echo "Coverage exclusions or coverage config changes since ${base}:" >&2
  printf '%s' "$filtered" >&2
  echo "Bot PRs may not exclude code from coverage or change coverage settings. Add tests instead." >&2
  exit 1
fi
echo "No coverage exclusions added since ${base}."
