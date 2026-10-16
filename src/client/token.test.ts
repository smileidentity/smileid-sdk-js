import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APIError,
  AuthenticationError,
  ConnectionError,
  UnexpectedResponseError,
  ValidationError,
} from '../errors/index.js';
import { Consent } from '../helpers/consent.js';
import { resolveConfig } from './config.js';
import { SmileID } from './client.js';
import { Transport } from './transport.js';
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

const kycId = { country: 'NG', idType: 'NIN', idNumber: '12345678901' };
const selfie = { selfieImage: FAKE_IMAGE, livenessImages: FAKE_LIVENESS };
const docImages = { ...selfie, document: FAKE_IMAGE, country: 'NG' };
const person = { userDetails, consent };

const jobOperations: Record<string, (c: SmileID) => Promise<unknown>> = {
  enhanced_kyc: (c) => c.enhancedKyc.verify({ ...kycId, ...person, userId: 'user-1' }),
  document_verification: (c) =>
    c.documents.verify({ ...docImages, ...person, userId: 'user-1' }),
  enhanced_document_verification: (c) =>
    c.documents.verifyEnhanced({ ...docImages, idType: 'PASSPORT', ...person, userId: 'user-1' }),
  residency_document_verification: (c) =>
    c.documents.verifyResidency({ ...docImages, visa: FAKE_IMAGE, ...person, userId: 'user-1' }),
  biometric_kyc: (c) =>
    c.biometricKyc.verify({ ...kycId, ...selfie, ...person, userId: 'user-1' }),
  smart_selfie_registration: (c) =>
    c.biometric.enroll({ ...selfie, ...person, userId: 'user-1' }),
  smart_selfie_authentication: (c) =>
    c.biometric.authenticate({ ...selfie, ...person, userId: 'user-1' }),
  smart_selfie_compare: (c) =>
    c.biometric.compare({
      selfieImage: FAKE_IMAGE,
      comparisonImage: FAKE_IMAGE,
      comparisonImageType: 'ID_PHOTO',
      ...person,
      userId: 'user-1',
    }),
};

const nonJobOperations: Record<string, (c: SmileID) => Promise<unknown>> = {
  status: (c) => c.verifications.retrieve(jobId),
  replay: (c) => c.verifications.replay(jobId),
  report_fraud: (c) =>
    c.users.flagFraud('user-1', { reason: 'ACCOUNT_TAKEOVER', reportedBy: 'risk@partner.example' }),
  id_status: (c) => c.services.idStatus({ country: 'NG', idType: 'NIN' }),
};

const anyResponse = (): Response =>
  jsonResponse(200, { status: 'processing', job_id: 'job_1', user_id: 'user_1' });

function enrolledKyc(client: SmileID, options?: { timeout?: number }): Promise<unknown> {
  return client.biometricKyc.verify(
    { ...kycId, ...person, useEnrolledImage: true, userId: 'user-1' },
    options,
  );
}

for (const [product, call] of Object.entries(jobOperations)) {
  test(`${product}: the token binds the job user and product`, async () => {
    const { fetch, requests } = routerFetch(anyResponse);
    await call(new SmileID({ partnerId: '1234', apiKey: 'k', fetch }));
    const req = requests.find(isToken);
    assert.ok(req);
    assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
    assert.deepEqual(fields(req), { user_id: 'user-1', product });
  });
}

for (const [name, call] of Object.entries(nonJobOperations)) {
  test(`${name}: the token binds nothing`, async () => {
    const { fetch, requests, tokenCalls } = routerFetch(anyResponse);
    await call(new SmileID({ partnerId: '1234', apiKey: 'k', fetch }));
    assert.equal(tokenCalls(), 1);
    assert.equal(requests.find(isToken)?.bodyText, '');
  });
}

test('a job without a user binds only its product', async () => {
  const { fetch, requests } = routerFetch(accepted);
  await enhancedKyc(new SmileID({ partnerId: '1234', apiKey: 'k', fetch }));
  const req = requests.find(isToken);
  assert.ok(req);
  assert.deepEqual(fields(req), { product: 'enhanced_kyc' });
});

test('each job sends the token minted for it', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await enhancedKyc(client);
  await enhancedKyc(client);
  await enhancedKyc(client);
  assert.equal(tokenCalls(), 3);
  const used = requests.filter((r) => !isToken(r)).map((r) => r.headers['SmileID-Token']);
  assert.deepEqual(used, ['token_1', 'token_2', 'token_3']);
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

const failedMints: [string, Response, new (...args: never[]) => Error][] = [
  ['401', jsonResponse(401, { status: 'Unauthorized', message: 'bad key' }), AuthenticationError],
  ['503', jsonResponse(503, { status: 'error', message: 'busy' }), APIError],
  ['empty token', jsonResponse(200, { token: '' }), UnexpectedResponseError],
];
for (const [name, response, error] of failedMints) {
  test(`a failed token mint (${name}) never sends the job`, async () => {
    const { fetch, requests } = recordingFetch([response]);
    const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch, maxRetries: 0 });
    await assert.rejects(() => enhancedKyc(client), error);
    assert.equal(requests.filter((r) => !isToken(r)).length, 0);
  });
}

test('the token request uses the request timeout', async () => {
  const requests: string[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(String(input));
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch, maxRetries: 0, timeout: 60_000 });
  const started = Date.now();
  await assert.rejects(
    () => client.enhancedKyc.verify({ ...kycId, ...person }, { timeout: 20 }),
    ConnectionError,
  );
  assert.ok(Date.now() - started < 5_000);
  assert.deepEqual(requests.length, 1);
  assert.ok(requests[0].endsWith('/v3/token'));
});

test('the token request honours the request signal', async () => {
  const { fetch, requests } = routerFetch(accepted);
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => client.enhancedKyc.verify({ ...kycId, ...person }, { signal: controller.signal }),
    ConnectionError,
  );
  assert.equal(requests.length, 0);
});

for (const userId of ['', ' user-1', 'user-1 ']) {
  test(`user id ${JSON.stringify(userId)} is rejected before any request`, async () => {
    const { fetch, requests } = routerFetch(accepted);
    const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
    await assert.rejects(() => enhancedKyc(client, userId), ValidationError);
    await assert.rejects(
      () => client.biometric.authenticate({ ...selfie, ...person, userId }),
      /userId/,
    );
    assert.equal(requests.length, 0);
  });
}

test('biometric KYC binds the enrolled-image grant to its token, not the job body', async () => {
  const { fetch, requests } = routerFetch(accepted);
  await enrolledKyc(new SmileID({ partnerId: '1234', apiKey: 'k', fetch }));
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
  await enrolledKyc(client);
  await client.verifications.retrieve(jobId);
  assert.equal(tokenCalls(), 2);
  const jobs = requests.filter((r) => !isToken(r));
  assert.equal(jobs[0].headers['SmileID-Token'], 'token_1');
  assert.equal(jobs[1].headers['SmileID-Token'], 'token_2');
  assert.equal(requests.filter(isToken)[1].bodyText, '');
});

test('the transport refuses a grant without a user', async () => {
  const { fetch, requests } = routerFetch(accepted);
  const transport = new Transport(resolveConfig({ partnerId: '1234', apiKey: 'k', fetch }));
  await assert.rejects(
    () =>
      transport.withEnrolledImageGrant().execute({
        method: 'POST',
        path: '/v3/biometric_kyc',
        authenticated: true,
        needsPartnerIdHeader: true,
        idempotent: false,
      }),
    /userId is required/,
  );
  assert.equal(requests.length, 0);
});

for (const value of ['true', 'false', 1, null]) {
  test(`useEnrolledImage ${JSON.stringify(value)} is rejected`, async () => {
    const { fetch, requests } = routerFetch(accepted);
    const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
    assert.throws(
      () =>
        client.biometricKyc.verify({
          ...kycId,
          ...selfie,
          ...person,
          userId: 'user-1',
          useEnrolledImage: value as unknown as boolean,
        }),
      /useEnrolledImage must be a boolean/,
    );
    assert.equal(requests.length, 0);
  });
}

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
