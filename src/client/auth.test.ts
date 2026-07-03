import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenManager, type ExecuteFn } from './auth.js';
import type { TransportResult } from './transport.js';
import { AuthenticationError, ConnectionError } from '../errors/index.js';
import { SmileID } from './client.js';
import { jsonResponse, makeJwt, recordingFetch, routerFetch } from '../testing/mock.js';

/** A stub transport execute that returns a token, counting calls. */
function stubExecute(
  token: () => string,
  delayMs = 0,
): { fn: ExecuteFn; calls: () => number } {
  let calls = 0;
  const fn: ExecuteFn = async () => {
    calls += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const body = { token: token() };
    const result: TransportResult = {
      statusCode: 200,
      json: body,
      rawBody: JSON.stringify(body),
      requestId: null,
    };
    return result;
  };
  return { fn, calls: () => calls };
}

// Matrix item 2: token lifecycle.
test('caches the token until exp − 60s, then refetches', async () => {
  let clock = 1_000_000;
  const exp = Math.floor(clock / 1000) + 120; // expires 120s from "now"
  const { fn, calls } = stubExecute(() => makeJwt(exp));
  const tm = new TokenManager('1234', 'k', fn, () => clock);

  const first = await tm.ensureToken();
  await tm.ensureToken();
  assert.equal(calls(), 1, 'second call served from cache');

  // Advance to within the 60s skew window → must refetch.
  clock += 70 * 1000;
  await tm.ensureToken();
  assert.equal(calls(), 2, 'refetched after entering the skew window');
  assert.equal(typeof first, 'string');
});

test('sends lowercase headers to /v3/token and no request body', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, { last_known_status: 'online' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'apikey', fetch });
  await client.services.idStatus({ country: 'NG', idType: 'NIN' });
  const req = requests.find((r) => r.url.endsWith('/v3/token'));
  assert.ok(req, 'a token request was made');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['smileid-partner-id'], '1234');
  assert.equal(req.headers['smileid-api-key'], 'apikey');
  assert.equal(req.headers['SmileID-Token'], undefined, 'token call is unauthenticated');
  assert.equal(req.bodyText, '', 'no body sent to the token endpoint');
});

test('concurrent callers share a single in-flight token fetch (no stampede)', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const { fn, calls } = stubExecute(() => makeJwt(exp), 10);
  const tm = new TokenManager('1234', 'k', fn);
  await Promise.all([tm.ensureToken(), tm.ensureToken(), tm.ensureToken()]);
  assert.equal(calls(), 1);
});

// The token POST is idempotent (spec §2.6): transient failures are retried.
test('token fetch retries a transient 503 then succeeds', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const { fetch, requests } = recordingFetch([
    jsonResponse(503, { status: 'Service Unavailable', message: 'try again' }),
    jsonResponse(200, { token: makeJwt(exp) }),
    jsonResponse(200, { status: 'complete', job_id: 'job_1', user_id: 'user_1', message: 'done' }),
  ]);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const js = await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(js.status, 'complete');
  const tokenRequests = requests.filter((r) => r.url.endsWith('/v3/token'));
  assert.equal(tokenRequests.length, 2, 'token endpoint retried once after the 503');
});

// Network failures during the token fetch surface as typed ConnectionError.
test('token fetch network failure maps to ConnectionError', async () => {
  const fetch = async (): Promise<Response> => {
    throw new TypeError('fetch failed');
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () => client.services.idStatus({ country: 'NG', idType: 'NIN' }),
    ConnectionError,
  );
});

test('refreshes on a 401 once, then retries the call once', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  let tokenFetches = 0;
  let statusCalls = 0;
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/v3/token')) {
      tokenFetches += 1;
      return jsonResponse(200, { token: makeJwt(exp) });
    }
    statusCalls += 1;
    if (statusCalls === 1) return jsonResponse(401, { status: 'Unauthorized', message: 'expired' });
    return jsonResponse(200, { status: 'complete', job_id: 'job_1', user_id: 'user_1', message: 'done' });
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const js = await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(js.status, 'complete');
  assert.equal(tokenFetches, 2, 'token refreshed once');
  assert.equal(statusCalls, 2, 'call retried once');
});

test('a second 401 raises AuthenticationError', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/v3/token')) return jsonResponse(200, { token: makeJwt(exp) });
    return jsonResponse(401, { status: 'Unauthorized', message: 'nope' });
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () => client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1'),
    AuthenticationError,
  );
});

test('the three unauthenticated services calls never fetch a token', async () => {
  let tokenFetches = 0;
  const fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/v3/token')) {
      tokenFetches += 1;
      return jsonResponse(200, { token: makeJwt(0) });
    }
    return jsonResponse(200, { bank_codes: [] });
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.services.bankCodes();
  await client.services.supportedIdTypes();
  await client.services.supportedDocuments();
  assert.equal(tokenFetches, 0);
});
