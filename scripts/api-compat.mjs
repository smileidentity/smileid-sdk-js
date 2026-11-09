#!/usr/bin/env node
//
// Compare api-extractor reports and report breaking changes.
//
// Usage: node scripts/api-compat.mjs <release.api.md> <head.api.md> [<base.api.md>]
//
// A declaration line (keyed by the declarations that enclose it) that is in
// the release report but not in the head report has been removed or changed:
// that is a break. Lines only in the head report are additions, which are
// fine. The check is deliberately conservative: a change that is compatible in
// practice (such as making a required input property optional) still counts.
//
// With a base report, breaks that the base branch already has are reported
// as inherited and do not fail the check, so a PR is only blamed for the
// breaks it introduces.
//
// Exits 1 if the head has breaks the base does not, 0 otherwise.

import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The set of declaration keys in an api-extractor report. */
export function apiEntries(report) {
  const start = report.indexOf('```ts');
  const end = report.lastIndexOf('```');
  if (start === -1 || end <= start) throw new Error('not an api-extractor report');
  const body = report.slice(start + '```ts'.length, end);

  const entries = new Set();
  const scope = [];
  for (const raw of body.split('\n')) {
    let line = raw.trim();
    if (line === '' || line.startsWith('//')) continue;
    // A string constant's value (such as VERSION) is not part of its contract.
    line = line.replace(/^(export )?(declare )?const (\w+) = "[^"]*";$/, '$1const $3: string;');
    if (line.startsWith('}')) {
      entries.add(`${scope.join(' > ')} :: ${line}`);
      scope.pop();
      continue;
    }
    entries.add(`${scope.join(' > ')} :: ${line}`);
    if (line.endsWith('{')) scope.push(line.slice(0, -1).trim());
  }
  return entries;
}

/** Entries of `before` missing from `after`. */
export function removed(before, after) {
  return [...before].filter((e) => !after.has(e)).sort();
}

function main(argv) {
  const [releasePath, headPath, basePath] = argv;
  if (!releasePath || !headPath) {
    console.error('usage: node scripts/api-compat.mjs <release.api.md> <head.api.md> [<base.api.md>]');
    process.exit(2);
  }
  const read = (p) => apiEntries(readFileSync(p, 'utf8'));
  const release = read(releasePath);
  const headBreaks = removed(release, read(headPath));
  const inherited = new Set(basePath ? removed(release, read(basePath)) : []);
  const introduced = headBreaks.filter((b) => !inherited.has(b));
  const stillInherited = headBreaks.filter((b) => inherited.has(b));

  if (stillInherited.length > 0) {
    console.log(
      `::warning title=Unreleased breaking changes::The base branch already removes or changes ${stillInherited.length} public API declaration(s) since the last release. They need a major version bump when released.`,
    );
    console.log('Already on the base branch (not caused by this PR):');
    for (const b of stillInherited) console.log(`  - ${b}`);
  }
  if (introduced.length > 0) {
    console.log('This PR removes or changes these public API declarations since the last release:');
    for (const b of introduced) console.log(`  - ${b}`);
    process.exit(1);
  }
  console.log('No new breaking changes to the public API since the last release.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
