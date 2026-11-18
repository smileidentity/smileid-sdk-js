import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as sdk from './index.js';

test('the package entry point exports the client and the AML methods', () => {
  assert.equal(typeof sdk.SmileID, 'function');
  const client = new sdk.SmileID({ partnerId: '1234', apiKey: 'k' });
  for (const method of ['screen', 'screenSync', 'monitor', 'monitoringNews'] as const) {
    assert.equal(typeof client.aml[method], 'function', method);
  }
});
