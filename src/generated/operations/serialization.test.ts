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
  assert.equal(req.headers['SmileID-Source-SDK-Version'], '12.0.0');
  // Cross-SDK format: smileid-sdk-node/<version> (node/<runtime version, no leading v>).
  assert.match(
    req.headers['User-Agent'],
    /^smileid-sdk-node\/12\.0\.0 \(node\/\d+\.\d+\.\d+[^)]*\)$/,
  );
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

// spec §6.10 as corrected — replay takes multipart/form-data (any other content type → 415).
test('replay with a callback override: multipart body with one callback_url text part', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, { status: 'accepted', job_id: 'job_1', user_id: 'test-user', message: 'ok' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.verifications.replay('job_01h8x9y2z3a4b5c6d7e8f9g0h1', {
    callbackUrl: 'https://app.example.com/cb',
  });

  const req = opRequest(requests);
  assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  // Exactly one part, a filename-less text part named callback_url.
  assert.match(
    req.bodyText,
    /Content-Disposition: form-data; name="callback_url"\r\n\r\nhttps:\/\/app.example.com\/cb\r\n/,
  );
  assert.equal(countParts(req.bodyText, 'callback_url'), 1);
  assert.ok(!req.bodyText.includes('filename='), 'text part carries no filename');
  assert.ok(!req.bodyText.includes('application/json'), 'no JSON part');
});

test('replay without a callback override sends no body at all', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, { status: 'accepted', job_id: 'job_1', user_id: 'test-user', message: 'ok' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.verifications.replay('job_01h8x9y2z3a4b5c6d7e8f9g0h1');

  const req = opRequest(requests);
  assert.equal(req.bodyText, '', 'no body');
  assert.equal(req.headers['Content-Type'], undefined, 'no Content-Type header');
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

// spec §6.3 — enhanced document verification requires id_type and Partner-ID header.
test('enhanced_document_verification: Partner-ID header, id_type part, repeated liveness', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.documents.verifyEnhanced({
    country: 'NG',
    idType: 'PASSPORT',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: FAKE_IMAGE,
    userDetails,
    consent,
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/enhanced_document_verification$/);
  assert.equal(req.headers['SmileID-Partner-ID'], '1234');
  assert.match(req.bodyText, /name="id_type"\r\n\r\nPASSPORT\r\n/);
  assert.equal(countParts(req.bodyText, 'liveness_images'), 6);
});

// spec §6.4 — biometric KYC: Partner-ID header, id fields, repeated liveness.
test('biometric_kyc: Partner-ID header and id scalar parts', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometricKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    userDetails,
    consent,
    userId: 'user_1',
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/biometric_kyc$/);
  assert.equal(req.headers['SmileID-Partner-ID'], '1234');
  assert.equal(req.headers['User-ID'], 'user_1');
  assert.match(req.bodyText, /name="id_number"\r\n\r\n12345678901\r\n/);
  assert.equal(countParts(req.bodyText, 'liveness_images'), 6);
});

// spec §6.5 — registration: no Partner-ID header, boolean scalar as "true".
test('registration: no Partner-ID header, allow_new_enroll as text "true"', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometric.enroll({
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    allowNewEnroll: true,
    userDetails,
    consent,
    userId: 'user_1',
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/registration$/);
  assert.equal(req.headers['SmileID-Partner-ID'], undefined);
  assert.equal(req.headers['User-ID'], 'user_1');
  assert.match(req.bodyText, /name="allow_new_enroll"\r\n\r\ntrue\r\n/);
});

// spec §6.7 — compare: comparison image + type, optional body user_id.
test('compare: comparison_image binary part, enum scalar, optional body user_id', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometric.compare({
    selfieImage: FAKE_IMAGE,
    comparisonImage: FAKE_IMAGE,
    comparisonImageType: 'ID_PHOTO',
    userDetails,
    consent,
    userId: 'user_1',
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/compare$/);
  assert.equal(req.headers['User-ID'], undefined, 'user_id goes in the body for compare');
  assert.match(req.bodyText, /name="comparison_image_type"\r\n\r\nID_PHOTO\r\n/);
  assert.match(req.bodyText, /name="user_id"\r\n\r\nuser_1\r\n/);
  assert.match(
    req.bodyText,
    /name="comparison_image"; filename="comparison.jpg"\r\nContent-Type: image\/jpeg/,
  );
});

// spec §6.8 — retrieve: GET with token, job id in the path.
test('status: GET /v3/status/{jobId} with a token and no body', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, {
      status: 'clear',
      job_id: 'job_1',
      user_id: 'user_1',
      message: 'Job completed',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const js = await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(js.isComplete, true);
  assert.equal(js.status, 'clear');

  const req = opRequest(requests);
  assert.equal(req.method, 'GET');
  assert.match(req.url, /\/v3\/status\/job_01h8x9y2z3a4b5c6d7e8f9g0h1$/);
  assert.ok(req.headers['SmileID-Token']);
  assert.equal(req.bodyText, '');
});

// spec §6.13 — supported_id_types: unauthenticated GET with country query.
test('supported_id_types: no token, country query, camelCased response', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(() =>
    jsonResponse(200, {
      id_types: [
        {
          country: 'NG',
          label: 'Bank Verification Number',
          regex: '^\\d{11}$',
          required_fields: ['first_name', 'last_name', 'dob'],
          type: 'BVN',
        },
      ],
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const res = await client.services.supportedIdTypes({ country: 'NG' });
  assert.equal(res.idTypes[0].type, 'BVN');
  assert.deepEqual(res.idTypes[0].requiredFields, ['first_name', 'last_name', 'dob']);
  assert.equal(tokenCalls(), 0);
  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/services\/supported_id_types\?country=NG$/);
  assert.equal(req.headers['SmileID-Token'], undefined);
});

// spec §6.14 — supported_documents: unauthenticated GET with snake_case query names.
test('supported_documents: no token, country_code and locale query params', async () => {
  const { fetch, requests, tokenCalls } = routerFetch(() =>
    jsonResponse(200, {
      valid_documents: [
        {
          country: { code: 'NG', name: 'Nigeria', continent: 'AFRICA' },
          id_types: [
            { code: 'DRIVERS_LICENSE', name: "Driver's License", example: ['AAA00000AA00'], has_back: true },
          ],
        },
      ],
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const res = await client.services.supportedDocuments({ countryCode: 'NG', locale: 'en-GB' });
  assert.equal(res.validDocuments[0].country.code, 'NG');
  assert.equal(res.validDocuments[0].idTypes[0].hasBack, true);
  assert.equal(tokenCalls(), 0);
  const req = opRequest(requests);
  assert.match(req.url, /country_code=NG/);
  assert.match(req.url, /locale=en-GB/);
  assert.equal(req.headers['SmileID-Token'], undefined);
});


// Cross-SDK content-type policy (spec §5.3): PNG detection applies only to
// document and document_back; selfie/liveness/comparison are always image/jpeg.
test('document PNG bytes are detected and sent as image/png', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.documents.verify({
    country: 'NG',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: png,
    userDetails,
    consent,
  });

  const req = opRequest(requests);
  assert.match(
    req.bodyText,
    /name="document"; filename="document.jpg"\r\nContent-Type: image\/png/,
  );
});

test('selfie_image is always image/jpeg even when the input claims otherwise', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.documents.verify({
    country: 'NG',
    selfieImage: { data: FAKE_IMAGE, contentType: 'image/png' },
    livenessImages: FAKE_LIVENESS.map((img) => ({ data: img, contentType: 'image/png' })),
    document: FAKE_IMAGE,
    userDetails,
    consent,
  });

  const req = opRequest(requests);
  assert.match(req.bodyText, /name="selfie_image"[^\r]*\r\nContent-Type: image\/jpeg/);
  assert.ok(
    !/name="(selfie_image|liveness_images)"[^\r]*\r\nContent-Type: image\/png/.test(req.bodyText),
    'no selfie or liveness part is PNG',
  );
});
