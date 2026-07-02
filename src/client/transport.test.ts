import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Transport, computeBackoff, parseRetryAfter, shouldRetry } from './transport.js';
import { resolveConfig } from './config.js';
import { APIError, ConflictError, ConnectionError } from '../errors/index.js';
import { jsonResponse, recordingFetch } from '../testing/mock.js';

function makeTransport(fetch: ReturnType<typeof recordingFetch>['fetch'], sleeps?: number[]): Transport {
  const sleep = async (ms: number): Promise<void> => {
    sleeps?.push(ms);
  };
  return new Transport(resolveConfig({ partnerId: '1234', apiKey: 'k', fetch }), sleep);
}

const getPlan = {
  method: 'GET' as const,
  path: '/v3/services/bank_codes',
  authenticated: false,
  needsPartnerIdHeader: false,
  idempotent: true,
};

const postPlan = {
  method: 'POST' as const,
  path: '/v3/enhanced_kyc',
  authenticated: false,
  needsPartnerIdHeader: false,
  idempotent: false,
};

// Matrix item 3: retry policy — pure predicates.
test('shouldRetry retries idempotent ops on retryable statuses and connection errors', () => {
  assert.equal(shouldRetry(true, 0, 2, 500), true);
  assert.equal(shouldRetry(true, 0, 2, 429), true);
  assert.equal(shouldRetry(true, 0, 2, 408), true);
  assert.equal(shouldRetry(true, 0, 2, null), true); // connection error
});

test('shouldRetry never retries 409, non-idempotent ops, or exhausted attempts', () => {
  assert.equal(shouldRetry(true, 0, 2, 409), false);
  assert.equal(shouldRetry(false, 0, 2, 500), false);
  assert.equal(shouldRetry(true, 2, 2, 500), false);
});

test('computeBackoff honours Retry-After when present', () => {
  assert.equal(computeBackoff(0, 3), 3000);
  assert.equal(computeBackoff(5, 0), 0);
});

test('computeBackoff grows exponentially with jitter otherwise', () => {
  const d0 = computeBackoff(0, null);
  const d2 = computeBackoff(2, null);
  assert.ok(d0 >= 50 && d0 < 100);
  assert.ok(d2 >= 200 && d2 < 250);
});

// Matrix item 3: retry policy — transport loop.
test('idempotent GET retries on 5xx then succeeds', async () => {
  const { fetch, calls } = recordingFetch([
    jsonResponse(500, { status: 'Server Error', message: 'boom' }),
    jsonResponse(500, { status: 'Server Error', message: 'boom' }),
    jsonResponse(200, { bank_codes: [] }),
  ]);
  const t = makeTransport(fetch);
  const res = await t.execute(getPlan);
  assert.equal(res.statusCode, 200);
  assert.equal(calls(), 3);
});

test('idempotent GET does not retry a 409', async () => {
  const { fetch, calls } = recordingFetch([
    jsonResponse(409, { status: 'Conflict', message: 'still processing' }),
  ]);
  const t = makeTransport(fetch);
  await assert.rejects(() => t.execute(getPlan), ConflictError);
  assert.equal(calls(), 1);
});

test('entry POST is never auto-retried', async () => {
  const { fetch, calls } = recordingFetch([
    jsonResponse(500, { status: 'Server Error', message: 'boom' }),
  ]);
  const t = makeTransport(fetch);
  await assert.rejects(() => t.execute(postPlan), APIError);
  assert.equal(calls(), 1);
});

test('honours the Retry-After header when retrying', async () => {
  const sleeps: number[] = [];
  const { fetch } = recordingFetch([
    jsonResponse(429, { status: 'Too Many Requests', message: 'slow down' }, { 'retry-after': '2' }),
    jsonResponse(200, { bank_codes: [] }),
  ]);
  const t = makeTransport(fetch, sleeps);
  await t.execute(getPlan);
  assert.deepEqual(sleeps, [2000]);
});

test('connection error on an idempotent op retries then raises ConnectionError', async () => {
  let n = 0;
  const fetch = async (): Promise<Response> => {
    n += 1;
    throw new Error('ECONNRESET');
  };
  const t = makeTransport(fetch);
  await assert.rejects(() => t.execute(getPlan), ConnectionError);
  assert.equal(n, 3); // initial + 2 retries
});

test('connection error on a non-idempotent op raises immediately', async () => {
  let n = 0;
  const fetch = async (): Promise<Response> => {
    n += 1;
    throw new Error('ECONNRESET');
  };
  const t = makeTransport(fetch);
  await assert.rejects(() => t.execute(postPlan), ConnectionError);
  assert.equal(n, 1);
});

// Cross-SDK standard: both RFC 7231 Retry-After forms, capped at 60 seconds.
test('computeBackoff caps an honoured Retry-After at 60 seconds', () => {
  assert.equal(computeBackoff(0, 120), 60000);
  assert.equal(computeBackoff(0, 60), 60000);
  assert.equal(computeBackoff(0, 59), 59000);
});

test('parseRetryAfter reads the delta-seconds form', () => {
  assert.equal(parseRetryAfter('2'), 2);
  assert.equal(parseRetryAfter('0'), 0);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('not-a-date'), null);
});

test('parseRetryAfter reads the RFC 7231 HTTP-date form', () => {
  const inFive = new Date(Date.now() + 5000).toUTCString();
  const parsed = parseRetryAfter(inFive);
  assert.ok(parsed !== null && parsed >= 3 && parsed <= 5, `parsed ${parsed}`);
  const past = new Date(Date.now() - 5000).toUTCString();
  assert.equal(parseRetryAfter(past), 0);
});

test('honours an HTTP-date Retry-After when retrying', async () => {
  const sleeps: number[] = [];
  const { fetch } = recordingFetch([
    jsonResponse(
      429,
      { status: 'Too Many Requests', message: 'slow down' },
      { 'retry-after': new Date(Date.now() + 4000).toUTCString() },
    ),
    jsonResponse(200, { bank_codes: [] }),
  ]);
  const t = makeTransport(fetch, sleeps);
  await t.execute(getPlan);
  assert.equal(sleeps.length, 1);
  assert.ok(sleeps[0] >= 2000 && sleeps[0] <= 4000, `slept ${sleeps[0]}`);
});
