import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERSION } from './version.js';

test('VERSION matches the package version', () => {
  assert.strictEqual(VERSION, '0.1.0');
});
