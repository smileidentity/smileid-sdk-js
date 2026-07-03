import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveConfig } from './config.js';
import { ValidationError } from '../errors/index.js';

const fetch = async (): Promise<Response> => new Response('{}');

// Fleet standard: baseUrl must be an absolute https URL with no query/fragment.
test('resolveConfig rejects non-https, relative, query and fragment baseUrl values', () => {
  const bad = [
    'http://testapi.smileidentity.com',
    'ftp://testapi.smileidentity.com',
    '/relative/path',
    'testapi.smileidentity.com',
    'https://testapi.smileidentity.com?x=1',
    'https://testapi.smileidentity.com#frag',
  ];
  for (const baseUrl of bad) {
    assert.throws(
      () => resolveConfig({ partnerId: '1234', apiKey: 'k', baseUrl, fetch }),
      ValidationError,
      `expected rejection for ${baseUrl}`,
    );
  }
});

test('resolveConfig accepts a valid https baseUrl and strips trailing slashes', () => {
  const config = resolveConfig({
    partnerId: '1234',
    apiKey: 'k',
    baseUrl: 'https://testapi.smileidentity.com/',
    fetch,
  });
  assert.equal(config.baseUrl, 'https://testapi.smileidentity.com');
});

test('the derived environment base URLs pass validation', () => {
  assert.equal(
    resolveConfig({ partnerId: '1234', apiKey: 'k', fetch }).baseUrl,
    'https://testapi.smileidentity.com',
  );
  assert.equal(
    resolveConfig({ partnerId: '1234', apiKey: 'k', environment: 'production', fetch }).baseUrl,
    'https://api.smileidentity.com',
  );
});

// Fleet standard: runtime environment guard for plain-JavaScript callers.
test('resolveConfig rejects an unknown environment at runtime', () => {
  assert.throws(
    () =>
      resolveConfig({
        partnerId: '1234',
        apiKey: 'k',
        environment: 'prod' as never,
        fetch,
      }),
    ValidationError,
  );
});

// Fleet standard: defaultCallbackUrl must be https, checked at construction.
test('resolveConfig rejects a non-https defaultCallbackUrl', () => {
  assert.throws(
    () =>
      resolveConfig({
        partnerId: '1234',
        apiKey: 'k',
        defaultCallbackUrl: 'http://app.example.com/cb',
        fetch,
      }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    resolveConfig({
      partnerId: '1234',
      apiKey: 'k',
      defaultCallbackUrl: 'https://app.example.com/cb?token=abc',
      fetch,
    }),
  );
});
