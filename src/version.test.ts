import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VERSION } from './version.js';

test('VERSION matches the package version', () => {
  // Compiled to dist/version.test.js, so package.json is one directory up.
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
    version: string;
  };
  assert.strictEqual(VERSION, pkg.version);
});
