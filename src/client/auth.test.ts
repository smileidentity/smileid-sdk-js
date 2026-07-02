import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenManager, buildSignatureHeaders } from './auth.js';
import { AuthenticationError } from '../errors/index.js';
import { SmileID } from './client.js';
import { jsonResponse, makeJwt, recordingFetch } from '../testing/mock.js';

const telemetry = (): Record<string, string> => ({ 'SmileID-Source-SDK': 'node' });

// Matrix item 2: token lifecycle.
test('caches the token until exp − 60s, then refetches', async () => {
  let clock = 1_000_000;
  const exp = Math.floor(clock / 1000) + 120; // expires 120s from "now"
  const { fetch, calls } = recordingFetch([jsonResponse(200, { token: makeJwt(exp) })]);
  const tm = new TokenManager('https://testapi.smileidentity.com', '1234', 'k', fetch, telemetry, () => clock);

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
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const { fetch, requests } = recordingFetch([jsonResponse(200, { token: makeJwt(exp) })]);
  const tm = new TokenManager('https://testapi.smileidentity.com', '1234', 'apikey', fetch, telemetry);
  await tm.ensureToken();
  const req = requests[0];
  assert.match(req.url, /\/v3\/token$/);
  assert.equal(req.headers['smileid-partner-id'], '1234');
  assert.equal(req.headers['smileid-api-key'], 'apikey');
  assert.equal(req.bodyText, '', 'no body sent to the token endpoint');
});

test('concurrent callers share a single in-flight token fetch (no stampede)', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  let tokenFetches = 0;
  const fetch = async (): Promise<Response> => {
    tokenFetches += 1;
    await new Promise((r) => setTimeout(r, 10));
    return jsonResponse(200, { token: makeJwt(exp) });
  };
  const tm = new TokenManager('https://testapi.smileidentity.com', '1234', 'k', fetch, telemetry);
  await Promise.all([tm.ensureToken(), tm.ensureToken(), tm.ensureToken()]);
  assert.equal(tokenFetches, 1);
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

test('buildSignatureHeaders signs timestamp + body with the partner secret', () => {
  const headers = buildSignatureHeaders('secret', Buffer.from('hello'), () => 0);
  assert.equal(headers['SmileID-Timestamp'], '1970-01-01T00:00:00.000Z');
  assert.match(headers['SmileID-Request-Signature'], /^[0-9a-f]{64}$/);
});
