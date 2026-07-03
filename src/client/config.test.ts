import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from './config.js';

const fetch = async (): Promise<Response> => new Response('{}');

test('resolveConfig rejects unsafe baseUrl values', () => {
  for (const baseUrl of ['http://api.example.com', 'ftp://api.example.com', '/relative']) {
    assert.throws(() => resolveConfig({ partnerId: '1234', apiKey: 'k', baseUrl, fetch }), {
      name: 'TypeError',
    });
  }
});

test('resolveConfig allows explicit insecure loopback baseUrl for tests', () => {
  const config = resolveConfig({
    partnerId: '1234',
    apiKey: 'k',
    baseUrl: 'http://localhost:8080',
    allowInsecureBaseUrl: true,
    fetch,
  });
  assert.equal(config.baseUrl, 'http://localhost:8080');
});

test('resolveConfig rejects unknown environment and insecure default callback URL', () => {
  assert.throws(
    () =>
      resolveConfig({
        partnerId: '1234',
        apiKey: 'k',
        environment: 'prod' as never,
        fetch,
      }),
    { name: 'TypeError' },
  );
  assert.throws(
    () =>
      resolveConfig({
        partnerId: '1234',
        apiKey: 'k',
        defaultCallbackUrl: 'http://partner.example.com/webhook',
        fetch,
      }),
    { name: 'TypeError' },
  );
});
