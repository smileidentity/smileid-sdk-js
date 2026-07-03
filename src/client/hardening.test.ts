import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SmileID } from './client.js';
import { UnexpectedResponseError, ValidationError } from '../errors/index.js';
import { Consent } from '../helpers/consent.js';
import {
  FAKE_IMAGE,
  FAKE_LIVENESS,
  jsonResponse,
  routerFetch,
} from '../testing/mock.js';
import type { UserDetails } from '../generated/models/index.js';

const consent = Consent.granted({
  grantedAt: '2026-03-06T12:00:00.000Z',
  noticeLanguage: 'EN',
  noticePrivacyPolicyUrl: 'https://example.com/privacy',
});
const userDetails: UserDetails = {
  givenNames: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
};

// Fleet standard: per-request callback URLs must be https; no request is made.
test('an http callbackUrl on an entry op raises ValidationError before any request', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(202, { status: 'Accepted' }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () =>
      client.enhancedKyc.verify({
        country: 'NG',
        idType: 'NIN',
        idNumber: '12345678901',
        userDetails,
        consent,
        callbackUrl: 'http://app.example.com/cb',
      }),
    ValidationError,
  );
  assert.equal(requests.length, 0, 'no request (not even a token fetch) was made');
});

test('an http callbackUrl on replay raises ValidationError before any request', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(202, { status: 'accepted' }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () =>
      client.verifications.replay('job_01h8x9y2z3a4b5c6d7e8f9g0h1', {
        callbackUrl: 'http://app.example.com/cb',
      }),
    ValidationError,
  );
  assert.equal(requests.length, 0);
});

test('an http callbackUrl in request options raises ValidationError', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(202, { status: 'Accepted' }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () =>
      client.enhancedKyc.verify(
        {
          country: 'NG',
          idType: 'NIN',
          idNumber: '12345678901',
          userDetails,
          consent,
        },
        { callbackUrl: 'http://app.example.com/cb' },
      ),
    ValidationError,
  );
  assert.equal(requests.length, 0);
});

// Fleet standard: a 2xx body that is not a JSON object raises
// UnexpectedResponseError with statusCode, rawBody and requestId populated.
test('a non-JSON 2xx body raises UnexpectedResponseError', async () => {
  const { fetch } = routerFetch(
    () =>
      new Response('<html>gateway</html>', {
        status: 200,
        headers: { 'content-type': 'text/html', 'x-request-id': 'req_42' },
      }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () => client.services.bankCodes(),
    (err: unknown) => {
      assert.ok(err instanceof UnexpectedResponseError);
      assert.equal(err.statusCode, 200);
      assert.equal(err.rawBody, '<html>gateway</html>');
      assert.equal(err.requestId, 'req_42');
      return true;
    },
  );
});

test('a JSON array 2xx body raises UnexpectedResponseError', async () => {
  const { fetch } = routerFetch(() => jsonResponse(200, ['not', 'an', 'object']));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(() => client.services.bankCodes(), UnexpectedResponseError);
});

// The retrieve 404 → not_found JobStatus path is unaffected.
test('retrieve still returns not_found on a 404 JSON body', async () => {
  const { fetch } = routerFetch(() =>
    jsonResponse(404, {
      status: 'not_found',
      job_id: 'job_1',
      user_id: 'unknown',
      message: 'Verification not found',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const js = await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(js.isNotFound, true);
});

// Fleet standard: path params are URL-encoded as single path segments.
test('a hostile user_id is encoded as a single path segment', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, { status: 'accepted', message: 'ok', user_id: 'u' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.users.reportFraud('user/../evil?x=1#f', {
    isFraud: true,
    reason: 'ACCOUNT_TAKEOVER',
    reportedBy: 'trust@example.com',
  });
  const req = requests.find((r) => !r.url.endsWith('/v3/token'));
  assert.ok(req);
  assert.match(req.url, /\/v3\/users\/user%2F..%2Fevil%3Fx%3D1%23f\/report_fraud$/);
});

test('golden job ids pass through path encoding byte-identical', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, { status: 'complete', job_id: 'job_1', message: 'done' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  const req = requests.find((r) => !r.url.endsWith('/v3/token'));
  assert.ok(req);
  assert.match(req.url, /\/v3\/status\/job_01h8x9y2z3a4b5c6d7e8f9g0h1$/);
});

// Fleet standard: hostile caller-supplied explicit content types are rejected
// on every path, including the wrapper input form.
test('a hostile explicit contentType on a document input is rejected', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(202, { status: 'accepted' }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () =>
      client.documents.verify({
        country: 'NG',
        selfieImage: FAKE_IMAGE,
        livenessImages: FAKE_LIVENESS,
        document: {
          data: FAKE_IMAGE,
          contentType: 'image/jpeg\r\nX-Injected: yes',
        },
        userDetails,
        consent,
      }),
    ValidationError,
  );
  assert.equal(requests.length, 0, 'rejected before any request was made');
});
