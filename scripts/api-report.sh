#!/usr/bin/env bash
#
# Build the public API report for a git ref with @microsoft/api-extractor.
#
# Usage: scripts/api-report.sh <ref> <output.api.md>
#
# Checks the ref out into a temporary worktree, installs its dependencies,
# compiles it, and runs this checkout's api-extractor against the package's
# "types" entry point. Forgotten exports (types the public API uses but the
# package does not export) are included, so changes to them are seen too.

set -euo pipefail

ref="${1:-}"
out="${2:-}"
if [ -z "$ref" ] || [ -z "$out" ]; then
  echo "usage: scripts/api-report.sh <ref> <output.api.md>" >&2
  exit 2
fi

root="$(git rev-parse --show-toplevel)"
extractor="$root/node_modules/.bin/api-extractor"
[ -x "$extractor" ] || {
  echo "api-report: $extractor not found; run npm ci first" >&2
  exit 1
}

work="$(cd "$(mktemp -d)" && pwd -P)"
cleanup() {
  git -C "$root" worktree remove --force "$work/src" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

git -C "$root" worktree add --quiet --detach "$work/src" "$ref"
(
  cd "$work/src"
  npm ci --ignore-scripts --no-audit --no-fund --loglevel=error
  npx --no-install tsc -p tsconfig.json
)

entry="$(cd "$work/src" && node -p "require('path').resolve(require('./package.json').types)")"

WORK="$work" ENTRY="$entry" node -e '
  const fs = require("fs");
  const path = require("path");
  const work = process.env.WORK;
  const config = {
    projectFolder: path.join(work, "src"),
    mainEntryPointFilePath: process.env.ENTRY,
    compiler: {
      overrideTsconfig: {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
          types: ["node"],
        },
        files: [process.env.ENTRY],
      },
    },
    apiReport: {
      enabled: true,
      reportFileName: "public",
      reportFolder: path.join(work, "report"),
      reportTempFolder: path.join(work, "report-temp"),
      includeForgottenExports: true,
    },
    docModel: { enabled: false },
    dtsRollup: { enabled: false },
    tsdocMetadata: { enabled: false },
    messages: {
      compilerMessageReporting: { default: { logLevel: "warning" } },
      extractorMessageReporting: { default: { logLevel: "none" } },
      tsdocMessageReporting: { default: { logLevel: "none" } },
    },
  };
  fs.mkdirSync(path.join(work, "report"), { recursive: true });
  fs.writeFileSync(path.join(work, "src", "api-extractor.smileid.json"), JSON.stringify(config, null, 2));
'

"$extractor" run --local --config "$work/src/api-extractor.smileid.json" >"$work/extractor.log" 2>&1 || {
  cat "$work/extractor.log" >&2
  echo "api-report: api-extractor failed for $ref" >&2
  exit 1
}

mkdir -p "$(dirname "$out")"
cp "$work/report/public.api.md" "$out"
echo "API report for $ref written to $out"
