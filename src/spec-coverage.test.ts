/**
 * Keeps spec-coverage.json honest about the code. CI checks the file against
 * the spec; this checks that every operation it claims is one the SDK has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmileID } from './client/client.js';
import * as ops from './generated/operations/index.js';

interface Supported {
  method: string;
  path: string;
  response_headers?: Record<string, unknown>;
}
type Entry = Supported | { unsupported: string };

// The tests run from dist/, one level below the repository root.
const ROOT = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'spec-coverage.json'), 'utf8')) as {
  operations: Record<string, Entry>;
};
const supported = Object.entries(manifest.operations).filter(
  (entry): entry is [string, Supported] => !('unsupported' in entry[1]),
);

/** `GET /v3/status/{jobId}` and `GET /v3/status/${...}` both become `GET /v3/status/{}`. */
function normalize(path: string): string {
  return path.replace(/\{[^}]+\}|\$\{[^}]+\}/g, '{}');
}

/**
 * The method and path of every request in a compiled module. There is no
 * operation table: each operation function in generated/operations names its
 * path in the request plan it builds, and the transport names the token path.
 */
function requestPaths(module: string): string[] {
  const source = readFileSync(join(__dirname, module), 'utf8');
  const plan = /method:\s*'([A-Z]+)',\s*path:\s*(['`])(\/v3[^'`]*)\2/g;
  return [...source.matchAll(plan)].map((m) => normalize(`${m[1]} ${m[3]}`));
}

test('spec-coverage.json: every supported method is a callable on the client', () => {
  const client = new SmileID({ partnerId: '1234', apiKey: 'k' });
  for (const [opId, { method }] of supported) {
    const [root, ...names] = method.split('.');
    assert.equal(root, 'client', `${opId}: method should start with "client."`);
    let target: unknown = client;
    for (const name of names) {
      target = (target as Record<string, unknown> | undefined)?.[name];
    }
    assert.equal(typeof target, 'function', `${opId}: ${method} is not a method of SmileID`);
  }
});

test('spec-coverage.json: supported paths are exactly the paths the SDK requests', () => {
  const operationPaths = requestPaths('generated/operations/index.js');
  // One request per operation function, so a path the pattern misses fails here.
  const functions = Object.values(ops).filter((v) => typeof v === 'function');
  assert.equal(operationPaths.length, functions.length, 'each operation function names one path');

  const sdkPaths = [...operationPaths, ...requestPaths('client/transport.js')].sort();
  assert.equal(new Set(sdkPaths).size, sdkPaths.length, 'no two operations share a path');
  const manifestPaths = supported.map(([, entry]) => normalize(entry.path)).sort();
  assert.deepEqual(
    manifestPaths,
    sdkPaths,
    'spec-coverage.json must list every operation the SDK calls, and only those',
  );
});
