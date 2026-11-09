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

hits="$(
  git diff --unified=0 --no-color --no-ext-diff "${base}...HEAD" |
    awk -v markers="$markers" -v self="$self" '
      /^\+\+\+ / {
        file = substr($0, 5)
        sub(/^b\//, "", file)
        next
      }
      /^@@ / {
        # @@ -a,b +c,d @@ : the next added line is line c of the new file.
        split($3, plus, ",")
        line = substr(plus[1], 2) + 0
        next
      }
      /^\+/ {
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
    '
)"

# Report build-file exclusions only when the build file configures JaCoCo.
filtered=""
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  case "$hit" in
    *": possible JaCoCo exclusion: "*)
      file="${hit%%:*}"
      if ! git show "HEAD:${file}" 2>/dev/null | grep -qi jacoco; then
        continue
      fi
      ;;
  esac
  filtered="${filtered}${hit}"$'\n'
done <<<"$hits"

if [ -n "$filtered" ]; then
  echo "Coverage exclusions added since ${base}:" >&2
  printf '%s' "$filtered" >&2
  echo "Bot PRs may not exclude code from coverage. Add tests instead." >&2
  exit 1
fi
echo "No coverage exclusions added since ${base}."
