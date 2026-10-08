import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AuthenticationError, ConnectionError } from '../errors/index.js';
import { Consent } from '../helpers/consent.js';
import { SmileID } from './client.js';
import {
  FAKE_IMAGE,
  FAKE_LIVENESS,
  jsonResponse,
  recordingFetch,
  routerFetch,
  type RecordedRequest,
} from '../testing/mock.js';

const consent = Consent.granted({
  grantedAt: '2026-03-06T12:00:00.000Z',
  noticeLanguage: 'EN',
  noticePrivacyPolicyUrl: 'https://example.com/privacy',
});
const userDetails = { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' };
const accepted = (): Response =>
  jsonResponse(202, { status: 'Accepted', job_id: 'job_1', user_id: 'user_1' });
const jobStatus = (): Response =>
  jsonResponse(200, { status: 'processing', job_id: 'job_1', user_id: 'user_1' });
const jobId = 'job_01h8x9y2z3a4b5c6d7e8f9g0h1';

const isToken = (r: RecordedRequest): boolean => r.url.endsWith('/v3/token');

/** Scalar form fields of a multipart body, by name. */
function fields(req: RecordedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of req.bodyText.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function enhancedKyc(client: SmileID, userId?: string): Promise<unknown> {
  return client.enhancedKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    userDetails,
    consent,
    userId,
  });
}

test('sends lowercase headers to /v3/token and no request body when no claims are set', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, { last_known_status: 'online' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'apikey', fetch });
  await client.services.idStatus({ country: 'NG', idType: 'NIN' });
  const req = requests.find(isToken);
  assert.ok(req, 'a token request was made');
  assert.equal(req.method, 'POST');
  assert.equal(req.headers['smileid-partner-id'], '1234');
  assert.equal(req.headers['smileid-api-key'], 'apikey');
  assert.equal(req.headers['SmileID-Token'], undefined, 'token call is unauthenticated');
  assert.equal(req.bodyText, '', 'no body sent to the token endpoint');
});

test('each job mints its own token', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await enhancedKyc(client);
  await enhancedKyc(client);
  await enhancedKyc(client);
  assert.equal(tokenCalls(), 3);
  const used = requests.filter((r) => !isToken(r)).map((r) => r.headers['SmileID-Token']);
  assert.equal(new Set(used).size, 3, 'no token is reused across jobs');
});

test('the token binds the job user and product', async () => {
  const { fetch, requests } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await enhancedKyc(client, 'user-1');
  const req = requests.find(isToken);
  assert.ok(req);
  assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.deepEqual(fields(req), { user_id: 'user-1', product: 'enhanced_kyc' });
});

test('the token binds the body user_id for authentication', async () => {
  const { fetch, requests } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.biometric.authenticate({
    userId: 'user-1',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    userDetails,
    consent,
  });
  const req = requests.find(isToken);
  assert.ok(req);
  assert.deepEqual(fields(req), { user_id: 'user-1', product: 'smart_selfie_authentication' });
});

test('status calls mint an unbound token', async () => {
  const { fetch, requests } = routerFetch(jobStatus);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.verifications.retrieve(jobId);
  const req = requests.find(isToken);
  assert.ok(req);
  assert.equal(req.bodyText, '');
});

test('a 401 is not retried', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(() =>
    jsonResponse(401, { status: 'Unauthorized', message: 'nope' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(() => enhancedKyc(client), AuthenticationError);
  assert.equal(requests.filter((r) => !isToken(r)).length, 1);
  assert.equal(tokenCalls(), 1);
});

test('retries of an idempotent request reuse its token', async () => {
  const { fetch, requests } = recordingFetch([
    jsonResponse(200, { token: 'tok_1' }),
    jsonResponse(503, { status: 'error', message: 'busy' }),
    jsonResponse(200, { status: 'processing', job_id: 'job_1' }),
  ]);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.verifications.retrieve(jobId);
  assert.equal(requests.filter(isToken).length, 1, 'one mint for both attempts');
  const attempts = requests.filter((r) => !isToken(r));
  assert.equal(attempts.length, 2);
  assert.deepEqual(
    attempts.map((r) => r.headers['SmileID-Token']),
    ['tok_1', 'tok_1'],
  );
});

test('biometric KYC binds the enrolled-image grant to its token, not the job body', async () => {
  const { fetch, requests } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.biometricKyc.verify({
    useEnrolledImage: true,
    userId: 'user-1',
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    userDetails,
    consent,
  });
  const token = requests.find(isToken);
  const job = requests.find((r) => !isToken(r));
  assert.ok(token && job);
  assert.deepEqual(fields(token), {
    user_id: 'user-1',
    product: 'biometric_kyc',
    use_enrolled_image: 'true',
  });
  assert.doesNotMatch(job.bodyText, /name="(use_enrolled_image|selfie_image|liveness_images)"/);
});

test('the grant does not reach later requests', async () => {
  const { fetch, requests, tokenCalls } = routerFetch((req) =>
    req.url.endsWith('/v3/biometric_kyc') ? accepted() : jobStatus(),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.biometricKyc.verify({
    useEnrolledImage: true,
    userId: 'user-1',
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    userDetails,
    consent,
  });
  await client.verifications.retrieve(jobId);
  assert.equal(tokenCalls(), 2);
  assert.equal(requests.filter(isToken)[1].bodyText, '');
});

// The token POST is idempotent (spec §2.6): transient failures are retried.
test('token fetch retries a transient 503 then succeeds', async () => {
  const { fetch, requests } = recordingFetch([
    jsonResponse(503, { status: 'Service Unavailable', message: 'try again' }),
    jsonResponse(200, { token: 'tok_1' }),
    jsonResponse(200, {
      status: 'clear',
      job_id: 'job_1',
      user_id: 'user_1',
      message: 'Job completed',
    }),
  ]);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const js = await client.verifications.retrieve(jobId);
  assert.equal(js.status, 'clear');
  assert.equal(requests.filter(isToken).length, 2, 'token endpoint retried once after the 503');
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

test('the three unauthenticated services calls never fetch a token', async () => {
  const { fetch, tokenCalls } = routerFetch(() => jsonResponse(200, { bank_codes: [] }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await client.services.bankCodes();
  await client.services.supportedIdTypes();
  await client.services.supportedDocuments();
  assert.equal(tokenCalls(), 0);
});
