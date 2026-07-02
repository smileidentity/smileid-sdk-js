import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SmileID } from '../../client/client.js';
import { Consent } from '../../helpers/consent.js';
import {
  FAKE_IMAGE,
  FAKE_LIVENESS,
  jsonResponse,
  routerFetch,
  type RecordedRequest,
} from '../../testing/mock.js';
import type { UserDetails } from '../models/index.js';

const consent = Consent.granted({
  grantedAt: '2026-03-06T12:00:00.000Z',
  noticeLanguage: 'EN',
  noticePrivacyPolicyUrl: 'https://example.com/privacy',
});
const userDetails: UserDetails = { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' };

const accepted202 = (status: string): Response =>
  jsonResponse(202, {
    status,
    message: 'Request accepted and queued for processing.',
    job_id: 'job_01h8x9y2z3a4b5c6d7e8f9g0h1',
    user_id: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
  });

/** The single non-token request captured by the router. */
function opRequest(requests: RecordedRequest[]): RecordedRequest {
  const req = requests.find((r) => !r.url.endsWith('/v3/token'));
  assert.ok(req, 'expected an operation request');
  return req;
}

function countParts(body: string, name: string): number {
  const matches = body.match(new RegExp(`name="${name}"`, 'g'));
  return matches ? matches.length : 0;
}

// Matrix item 1: golden multipart serialization (spec §6.1).
test('enhanced_kyc: scalar + JSON parts, User-ID header, no Partner-ID header', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.enhancedKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    userDetails,
    consent,
    userId: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
  });

  assert.equal(accepted.jobId, 'job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(accepted.isAccepted, true);

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/enhanced_kyc$/);
  assert.equal(req.headers['User-ID'], 'user_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(req.headers['SmileID-Partner-ID'], undefined, 'no Partner-ID header for enhanced_kyc');
  assert.ok(req.headers['SmileID-Token'], 'token attached');
  assert.equal(req.headers['SmileID-Source-SDK'], 'node');
  assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);

  const body = req.bodyText;
  // Scalars as plain text parts, verbatim snake_case names.
  assert.match(body, /Content-Disposition: form-data; name="country"\r\n\r\nNG\r\n/);
  assert.match(body, /name="id_type"\r\n\r\nNIN\r\n/);
  assert.match(body, /name="id_number"\r\n\r\n12345678901\r\n/);
  // JSON object parts carry Content-Type: application/json and snake_case keys.
  assert.match(
    body,
    /name="user_details"\r\nContent-Type: application\/json\r\n\r\n\{"given_names":"John","last_name":"Doe","email":"john@example.com"\}\r\n/,
  );
  assert.match(
    body,
    /name="consent"\r\nContent-Type: application\/json\r\n\r\n\{"granted":true,"granted_at":"2026-03-06T12:00:00.000Z","notice_language":"EN","notice_privacy_policy_url":"https:\/\/example.com\/privacy"\}\r\n/,
  );
});

// spec §6.2
test('document_verification: repeated liveness_images parts, Partner-ID header, binary parts', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.documents.verify({
    country: 'NG',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: FAKE_IMAGE,
    userDetails: { givenNames: 'John', lastName: 'Doe', phoneNumber: '+2348012345678' },
    consent,
    userId: 'user_1',
  });
  assert.equal(accepted.isAccepted, true);

  const req = opRequest(requests);
  assert.equal(req.headers['SmileID-Partner-ID'], '1234');
  const body = req.bodyText;
  // Repeated field, one part per image — never CSV/indexed.
  assert.equal(countParts(body, 'liveness_images'), 6);
  assert.equal(countParts(body, 'liveness_images[0]'), 0);
  // Binary parts include a filename and content type.
  assert.match(body, /name="selfie_image"; filename="selfie.jpg"\r\nContent-Type: image\/jpeg/);
  assert.match(body, /name="document"; filename="document.jpg"\r\nContent-Type: image\/jpeg/);
  assert.match(body, /name="liveness_images"; filename="liveness1.jpg"\r\nContent-Type: image\/jpeg/);
});

// spec §6.6 — user_id in body, no User-ID header.
test('authentication: user_id is a body field, not the User-ID header', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometric.authenticate({
    userId: 'user_1',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    userDetails,
    consent,
  });

  const req = opRequest(requests);
  assert.equal(req.headers['User-ID'], undefined, 'no User-ID header for authentication');
  assert.match(req.bodyText, /name="user_id"\r\n\r\nuser_1\r\n/);
});

// spec §6.11 — report_fraud multipart.
test('report_fraud: multipart scalar parts', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, { status: 'accepted', message: 'Fraud report accepted', user_id: 'user-123' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.users.reportFraud('user-123', {
    isFraud: true,
    reason: 'ACCOUNT_TAKEOVER',
    reportedBy: 'ops@example.com',
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/users\/user-123\/report_fraud$/);
  assert.match(req.headers['Content-Type'], /^multipart\/form-data/);
  const body = req.bodyText;
  assert.match(body, /name="is_fraud"\r\n\r\ntrue\r\n/);
  assert.match(body, /name="reported_by"\r\n\r\nops@example.com\r\n/);
  assert.match(body, /name="reason"\r\n\r\nACCOUNT_TAKEOVER\r\n/);
});

// spec §6.10 — replay uses a JSON body, not multipart.
test('replay: JSON body, not multipart', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, { status: 'accepted', job_id: 'job_1', user_id: 'test-user', message: 'ok' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.verifications.replay('job_01h8x9y2z3a4b5c6d7e8f9g0h1', {
    callbackUrl: 'https://app.example.com/cb',
  });

  const req = opRequest(requests);
  assert.equal(req.headers['Content-Type'], 'application/json');
  assert.equal(req.bodyText, JSON.stringify({ callback_url: 'https://app.example.com/cb' }));
});

// spec §6.15 — id_status query params, token required.
test('id_status: sends country + id_type query params with a token', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, {
      last_checked: '2026-04-14T12:30:00.000Z',
      last_check_status: 'success',
      last_hour_success_rate: '95%',
      last_known_status: 'online',
      last_check_success_rate: '90%',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const res = await client.services.idStatus({ country: 'NG', idType: 'NIN' });
  assert.equal(res.lastKnownStatus, 'online');

  const req = opRequest(requests);
  assert.match(req.url, /country=NG/);
  assert.match(req.url, /id_type=NIN/);
  assert.ok(req.headers['SmileID-Token']);
});

// spec §6.12 — services responses are camelCased; no token attached.
test('bank_codes: camelCases the response and attaches no token', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(() =>
    jsonResponse(200, { bank_codes: [{ code: '044', country: 'NG', name: 'Access Bank' }] }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const res = await client.services.bankCodes({ country: 'NG' });
  assert.equal(res.bankCodes[0].name, 'Access Bank');
  assert.equal(tokenCalls(), 0);
  const req = opRequest(requests);
  assert.equal(req.headers['SmileID-Token'], undefined);
  assert.match(req.url, /country=NG/);
});
