import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SmileID } from '../../client/client.js';
import { APIError, InvalidRequestError } from '../../errors/index.js';
import { Consent } from '../../helpers/consent.js';
import { VERSION } from '../../version.js';
import {
  FAKE_IMAGE,
  FAKE_LIVENESS,
  jsonResponse,
  routerFetch,
  type RecordedRequest,
} from '../../testing/mock.js';
import type { UserDetails } from '../models/index.js';
import type { Transport } from '../../client/transport.js';
import { enhancedKyc as enhancedKycOp } from './index.js';

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

/** Escape every RegExp metacharacter in `s`. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  assert.equal(req.headers['SmileID-Source-SDK-Version'], VERSION);
  // Cross-SDK format: smileid-sdk-node/<version> (node/<runtime version, no leading v>).
  assert.match(
    req.headers['User-Agent'],
    new RegExp(`^smileid-sdk-node/${escapeRegExp(VERSION)} \\(node/\\d+\\.\\d+\\.\\d+[^)]*\\)$`),
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

// ---- Basic KYC ----------------------------------------------------------------

const basicKycBase = {
  country: 'NG',
  idType: 'NIN',
  idNumber: '12345678901',
  userDetails,
  consent,
};

test('basic_kyc: scalar + JSON parts, no User-ID or Partner-ID header', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.basicKyc.verify({
    ...basicKycBase,
    bankCode: '044',
    operator: 'MTN',
    callbackUrl: 'https://example.com/callback',
    partnerParams: { order_id: 'ORD-1' },
    metadata: [{ name: 'k', value: 'v' }],
  });

  assert.equal(accepted.jobId, 'job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(accepted.isAccepted, true);

  const req = opRequest(requests);
  assert.equal(req.method, 'POST');
  assert.match(req.url, /\/v3\/basic_kyc$/);
  assert.equal(req.headers['User-ID'], undefined);
  assert.equal(countParts(req.bodyText, 'user_id'), 0);
  assert.equal(req.headers['SmileID-Partner-ID'], undefined);
  assert.ok(req.headers['SmileID-Token'], 'token attached');
  assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  const body = req.bodyText;
  assert.match(body, /name="country"\r\n\r\nNG\r\n/);
  assert.match(body, /name="id_type"\r\n\r\nNIN\r\n/);
  assert.match(body, /name="id_number"\r\n\r\n12345678901\r\n/);
  assert.match(body, /name="bank_code"\r\n\r\n044\r\n/);
  assert.match(body, /name="operator"\r\n\r\nMTN\r\n/);
  assert.match(body, /name="callback_url"\r\n\r\nhttps:\/\/example.com\/callback\r\n/);
  assert.match(
    body,
    /name="user_details"\r\nContent-Type: application\/json\r\n\r\n\{"given_names":"John","last_name":"Doe","email":"john@example.com"\}\r\n/,
  );
  assert.match(
    body,
    /name="consent"\r\nContent-Type: application\/json\r\n\r\n\{"granted":true,"granted_at":"2026-03-06T12:00:00.000Z","notice_language":"EN","notice_privacy_policy_url":"https:\/\/example.com\/privacy"\}\r\n/,
  );
  assert.match(body, /name="partner_params"\r\nContent-Type: application\/json\r\n\r\n\{"order_id":"ORD-1"\}\r\n/);
  assert.match(body, /name="metadata"\r\nContent-Type: application\/json\r\n\r\n\[\{"name":"k","value":"v"\}\]\r\n/);
});

test('basic_kyc: needs an email or a phone number', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const noContact = { givenNames: 'John', lastName: 'Doe' };
  assert.throws(() => client.basicKyc.verify({ ...basicKycBase, userDetails: noContact }));
  assert.throws(() =>
    client.basicKyc.verifySync({ ...basicKycBase, userDetails: noContact }),
  );
  assert.equal(requests.length, 0);
});

const basicKycResultBody = {
  status: 'attention',
  message: 'Verification completed: partial match.',
  reason: null,
  created_at: '2026-03-10T12:00:00.000Z',
  completed_at: '2026-03-10T12:00:04.000Z',
  product: 'basic_kyc',
  partner_params: { order_id: 'ORD-12345' },
  match_results: {
    overall: 'partial_match',
    names: 'partial_match',
    first_name: 'exact_match',
    last_name: 'transposed',
    other_names: 'not_provided',
    date_of_birth: 'exact_match',
    gender: 'no_match',
    phone_number: 'exact_match',
    secondary_id_number: 'not_provided',
  },
  user_provided_info: {
    given_names: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone_number: null,
    id_number: '12345678901',
  },
  consent: { granted: true },
  antifraud: null,
  device_signals: { ip_address: '10.0.0.1' },
  kyc_receipt: 'https://example.com/receipt',
};

test('basicKyc.verifySync: no callback, parses the result into the typed model', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(200, basicKycResultBody));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const result = await client.basicKyc.verifySync(basicKycBase);

  const req = opRequest(requests);
  assert.equal(req.method, 'POST');
  assert.match(req.url, /\/v3\/basic_kyc\/sync$/);
  assert.equal(req.headers['User-ID'], undefined);
  assert.equal(req.headers['SmileID-Partner-ID'], undefined);
  assert.equal(countParts(req.bodyText, 'callback_url'), 0);
  assert.match(req.bodyText, /name="id_number"\r\n\r\n12345678901\r\n/);

  assert.equal(result.status, 'attention');
  assert.equal(result.reason, null);
  assert.equal(result.createdAt, '2026-03-10T12:00:00.000Z');
  assert.equal(result.completedAt, '2026-03-10T12:00:04.000Z');
  assert.equal(result.product, 'basic_kyc');
  assert.deepEqual(result.matchResults, {
    overall: 'partial_match',
    names: 'partial_match',
    firstName: 'exact_match',
    lastName: 'transposed',
    otherNames: 'not_provided',
    dateOfBirth: 'exact_match',
    gender: 'no_match',
    phoneNumber: 'exact_match',
    secondaryIdNumber: 'not_provided',
  });
  assert.deepEqual(result.userProvidedInfo, {
    givenNames: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phoneNumber: null,
    idNumber: '12345678901',
  });
  assert.equal(result.kycReceipt, 'https://example.com/receipt');
  // Free-form objects keep their wire keys.
  assert.deepEqual(result.partnerParams, { order_id: 'ORD-12345' });
  assert.deepEqual(result.consent, { granted: true });
  assert.equal(result.antifraud, null);
  assert.deepEqual(result.deviceSignals, { ip_address: '10.0.0.1' });
});

test('basicKyc.verifySync: an errored job has no match results', async () => {
  const { fetch } = routerFetch(() =>
    jsonResponse(200, { ...basicKycResultBody, status: 'error', match_results: null }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const result = await client.basicKyc.verifySync(basicKycBase);
  assert.equal(result.status, 'error');
  assert.equal(result.matchResults, null);
});

test('basicKyc.verifySync: sends no client default callback URL', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(200, basicKycResultBody));
  const client = new SmileID({
    partnerId: '1234',
    apiKey: 'k',
    fetch,
    defaultCallbackUrl: 'https://example.com/default',
  });

  await client.basicKyc.verifySync(basicKycBase);
  assert.equal(countParts(opRequest(requests).bodyText, 'callback_url'), 0);
});

test('basicKyc.verifySync: sends a callback URL the caller sets explicitly', async () => {
  const { fetch, requests } = routerFetch(() => jsonResponse(200, basicKycResultBody));
  const client = new SmileID({
    partnerId: '1234',
    apiKey: 'k',
    fetch,
    defaultCallbackUrl: 'https://example.com/default',
  });

  await client.basicKyc.verifySync({
    ...basicKycBase,
    callbackUrl: 'https://example.com/param',
  });
  await client.basicKyc.verifySync(basicKycBase, { callbackUrl: 'https://example.com/option' });
  const [fromParams, fromOptions] = requests.filter((r) => !r.url.endsWith('/v3/token'));
  assert.match(fromParams!.bodyText, /name="callback_url"\r\n\r\nhttps:\/\/example.com\/param\r\n/);
  assert.match(fromOptions!.bodyText, /name="callback_url"\r\n\r\nhttps:\/\/example.com\/option\r\n/);
});

test('basicKyc.verifySync: optional result fields may be absent', async () => {
  const { partner_params, antifraud, device_signals, kyc_receipt, ...minimal } =
    basicKycResultBody;
  void [partner_params, antifraud, device_signals, kyc_receipt];
  const { fetch } = routerFetch(() => jsonResponse(200, minimal));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const result = await client.basicKyc.verifySync(basicKycBase);
  assert.equal(result.status, 'attention');
  assert.equal(result.partnerParams, undefined);
  assert.equal(result.antifraud, undefined);
  assert.equal(result.deviceSignals, undefined);
  assert.equal(result.kycReceipt, undefined);
  assert.deepEqual(result.consent, { granted: true });
});

for (const [status, ErrorClass, body] of [
  [408, InvalidRequestError, { status: 'Request Timeout', message: 'The ID authority did not respond in time.' }],
  [424, InvalidRequestError, { status: 'Failed Dependency', message: 'Unable to verify ID — ID authority unavailable.' }],
  [500, APIError, { status: 'Internal Server Error', message: 'Something went wrong.' }],
] as const) {
  test(`basicKyc.verifySync: is not retried after a ${status}`, async () => {
    const { fetch, requests } = routerFetch(() => jsonResponse(status, body));
    const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

    await assert.rejects(client.basicKyc.verifySync(basicKycBase), (err: unknown) => {
      assert.ok(err instanceof ErrorClass);
      assert.equal(err.statusCode, status);
      assert.equal(err.status, body.status);
      return true;
    });
    assert.equal(requests.filter((r) => !r.url.endsWith('/v3/token')).length, 1);
  });
}

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

// residency document verification — visa part, PASSPORT id_type, Partner-ID header.
test('residency_document_verification: visa part, id_type defaults to PASSPORT, repeated liveness', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.documents.verifyResidency({
    country: 'ZA',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: FAKE_IMAGE,
    visa: FAKE_IMAGE,
    userDetails,
    consent,
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/residency_document_verification$/);
  assert.equal(req.headers['SmileID-Partner-ID'], '1234');
  assert.match(req.bodyText, /name="id_type"\r\n\r\nPASSPORT\r\n/);
  assert.equal(countParts(req.bodyText, 'visa'), 1);
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

// spec §6.4 — useEnrolledImage makes the images optional and never reaches the body.
test('biometric_kyc: useEnrolledImage sends no images and no use_enrolled_image part', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometricKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    useEnrolledImage: true,
    userDetails,
    consent,
    userId: 'user_1',
  });

  const req = opRequest(requests);
  assert.equal(countParts(req.bodyText, 'selfie_image'), 0);
  assert.equal(countParts(req.bodyText, 'liveness_images'), 0);
  assert.equal(countParts(req.bodyText, 'use_enrolled_image'), 0);
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

// Optional JSON parts: partner_params and metadata are sent as JSON parts when given.
test('enhanced_kyc: partner_params and metadata are JSON parts when provided', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.enhancedKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '12345678901',
    userDetails,
    consent,
    partnerParams: { job_ref: 'abc' },
    metadata: [{ name: 'channel', value: 'web' }],
  });

  const body = opRequest(requests).bodyText;
  assert.match(
    body,
    /name="partner_params"\r\nContent-Type: application\/json\r\n\r\n\{"job_ref":"abc"\}\r\n/,
  );
  assert.match(
    body,
    /name="metadata"\r\nContent-Type: application\/json\r\n\r\n\[\{"name":"channel","value":"web"\}\]\r\n/,
  );
});

// document_back is an optional binary part on every document operation.
test('document operations send a document_back part only when given', async () => {
  const back = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const base = {
    country: 'NG',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: FAKE_IMAGE,
    documentBack: back,
    userDetails,
    consent,
  };

  await client.documents.verify(base);
  await client.documents.verifyEnhanced({ ...base, idType: 'PASSPORT' });
  await client.documents.verifyResidency({ ...base, visa: FAKE_IMAGE });

  const ops = requests.filter((r) => !r.url.endsWith('/v3/token'));
  assert.equal(ops.length, 3);
  for (const req of ops) {
    assert.equal(countParts(req.bodyText, 'document_back'), 1, req.url);
    assert.match(
      req.bodyText,
      /name="document_back"; filename="document_back.jpg"\r\nContent-Type: image\/png/,
    );
  }
});

test('compare: optional liveness_images are sent as repeated parts', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('Accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.biometric.compare({
    selfieImage: FAKE_IMAGE,
    comparisonImage: FAKE_IMAGE,
    comparisonImageType: 'ID_PHOTO',
    livenessImages: FAKE_LIVENESS,
    userDetails,
    consent,
  });

  const body = opRequest(requests).bodyText;
  assert.equal(countParts(body, 'liveness_images'), 6);
  assert.equal(countParts(body, 'user_id'), 0, 'no user_id part when none is given');
});

// Response mapping: every field is read defensively from the wire.
test('accepted response maps created_at when present', async () => {
  const { fetch } = routerFetch(() =>
    jsonResponse(202, {
      status: 'Accepted',
      message: 'queued',
      job_id: 'job_1',
      user_id: 'user_1',
      created_at: '2026-03-06T12:00:00Z',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.enhancedKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '1',
    userDetails,
    consent,
  });
  assert.equal(accepted.createdAt, '2026-03-06T12:00:00Z');
});

test('accepted response with missing or mistyped fields falls back to defaults', async () => {
  const { fetch } = routerFetch(() =>
    jsonResponse(202, { status: 7, message: null, job_id: 1, user_id: false }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.enhancedKyc.verify({
    country: 'NG',
    idType: 'NIN',
    idNumber: '1',
    userDetails,
    consent,
  });
  assert.equal(accepted.status, '');
  assert.equal(accepted.message, '');
  assert.equal(accepted.jobId, null);
  assert.equal(accepted.userId, null);
  assert.equal(accepted.createdAt, null);
});

test('accepted response from a transport that returns no JSON maps to defaults', async () => {
  const transport = {
    defaultCallbackUrl: null,
    execute: async () => ({ statusCode: 202, json: null, rawBody: '', requestId: null }),
  } as unknown as Transport;

  const accepted = await enhancedKycOp(transport, {
    country: 'NG',
    idType: 'NIN',
    idNumber: '1',
    userDetails,
    consent,
  });
  assert.equal(accepted.status, '');
  assert.equal(accepted.message, '');
  assert.equal(accepted.jobId, null);
});

test('status: a 404 with an empty body maps to an empty JobStatus', async () => {
  const { fetch } = routerFetch(() => new Response('', { status: 404 }));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const js = await client.verifications.retrieve('job_missing');
  assert.equal(js.status, '');
  assert.equal(js.jobId, null);
  assert.equal(js.userId, null);
  assert.equal(js.message, null);
});

// ---- AML ----------------------------------------------------------------------

const amlBase = {
  countries: ['NG', 'KE'],
  fullName: 'John Doe',
  userDetails,
  consent,
};

const consentWire =
  '{"granted":true,"granted_at":"2026-03-06T12:00:00.000Z","notice_language":"EN","notice_privacy_policy_url":"https://example.com/privacy"}';

test('aml.screen: exact multipart body, JSON-encoded arrays, no User-ID or Partner-ID header', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(202, {
      status: 'accepted',
      message: 'Job submitted successfully',
      job_id: 'job_01h8x9y2z3a4b5c6d7e8f9g0h1',
      user_id: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.aml.screen({
    ...amlBase,
    birthYear: '1990',
    strictMatch: false,
    aliases: ['Johnny Doe'],
    searchExistingUser: true,
    userId: 'user-1234',
    callbackUrl: 'https://example.com/callback',
    partnerParams: { order_id: 'ORD-1' },
    metadata: [{ name: 'k', value: 'v' }],
  });

  assert.equal(accepted.isAccepted, true);
  assert.equal(accepted.jobId, 'job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(accepted.userId, 'user_01h8x9y2z3a4b5c6d7e8f9g0h1');

  const req = opRequest(requests);
  assert.equal(req.method, 'POST');
  assert.match(req.url, /\/v3\/aml$/);
  assert.equal(req.headers['User-ID'], undefined);
  assert.equal(req.headers['SmileID-Partner-ID'], undefined);
  assert.equal(req.headers['SmileID-Idempotency-Key'], undefined);
  assert.ok(req.headers['SmileID-Token']);
  assert.match(req.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  const field = (name: string): string | undefined =>
    req.bodyText.match(new RegExp(`name="${name}"\\r\\n(?:Content-Type: [^\\r]*\\r\\n)?\\r\\n([^\\r]*)\\r\\n`))?.[1];
  assert.equal(field('full_name'), 'John Doe');
  assert.equal(field('birth_year'), '1990');
  assert.equal(field('strict_match'), 'false');
  assert.equal(field('search_existing_user'), 'true');
  assert.equal(field('user_id'), 'user-1234');
  assert.equal(field('callback_url'), 'https://example.com/callback');
  assert.equal(field('countries'), '["NG","KE"]');
  assert.equal(field('aliases'), '["Johnny Doe"]');
  assert.equal(
    field('user_details'),
    '{"given_names":"John","last_name":"Doe","email":"john@example.com"}',
  );
  assert.equal(field('consent'), consentWire);
  assert.equal(field('partner_params'), '{"order_id":"ORD-1"}');
  assert.equal(field('metadata'), '[{"name":"k","value":"v"}]');
});

test('aml.screen: omits optional parts and falls back to the client default callback', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({
    partnerId: '1234',
    apiKey: 'k',
    fetch,
    defaultCallbackUrl: 'https://example.com/default',
  });

  await client.aml.screen(amlBase);

  const body = opRequest(requests).bodyText;
  for (const name of ['birth_year', 'strict_match', 'search_existing_user', 'user_id', 'aliases']) {
    assert.equal(countParts(body, name), 0, name);
  }
  assert.match(body, /name="callback_url"\r\n\r\nhttps:\/\/example.com\/default\r\n/);
});

test('aml.screen: client-side validation fails before any request', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const cases: Record<string, Partial<Parameters<typeof client.aml.screen>[0]>> = {
    'countries must contain': { countries: [] },
    'aliases must contain at most 20': { aliases: Array.from({ length: 21 }, () => 'a') },
    'birthYear must be a four-digit': { birthYear: '90' },
    'userId is required when searchExistingUser': { searchExistingUser: true },
  };
  for (const [message, override] of Object.entries(cases)) {
    assert.throws(
      () => client.aml.screen({ ...amlBase, ...override }),
      (err: Error) => err.message.includes(message),
    );
  }
  assert.equal(requests.length, 0);
});

test('aml.screenSync: idempotency key header, optional callback, parses the terminal result', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, {
      status: 'attention',
      message: 'Screening completed: matches found.',
      reason: 'aml_match_found',
      created_at: '2026-07-20T12:00:00.000Z',
      completed_at: '2026-07-20T12:00:01.000Z',
      product: 'one_time_aml',
      partner_params: { order_id: 'ORD-1' },
      kyc_receipt: 'https://example.com/receipt',
      strict_match: true,
      no_of_persons_found: 1,
      people: [{ name: 'John Doe', news_summary: [{ news_category: 'regulatory' }] }],
      user_provided_info: {
        given_names: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        phone_number: null,
      },
      consent: { granted: true },
      antifraud: null,
      device_signals: { ip_address: '10.0.0.1' },
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const result = await client.aml.screenSync({
    ...amlBase,
    idempotencyKey: 'kuda-onboarding-8f14e45fceea167a',
  });

  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/aml\/sync$/);
  assert.equal(req.headers['SmileID-Idempotency-Key'], 'kuda-onboarding-8f14e45fceea167a');
  assert.equal(countParts(req.bodyText, 'callback_url'), 0);

  assert.equal(result.status, 'attention');
  assert.equal(result.reason, 'aml_match_found');
  assert.equal(result.completedAt, '2026-07-20T12:00:01.000Z');
  assert.equal(result.kycReceipt, 'https://example.com/receipt');
  assert.equal(result.strictMatch, true);
  assert.equal(result.noOfPersonsFound, 1);
  assert.deepEqual(result.userProvidedInfo, {
    givenNames: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phoneNumber: null,
  });
  // Free-form objects keep their wire keys.
  assert.deepEqual(result.partnerParams, { order_id: 'ORD-1' });
  assert.deepEqual(result.people, [
    { name: 'John Doe', news_summary: [{ news_category: 'regulatory' }] },
  ]);
  assert.deepEqual(result.consent, { granted: true });
  assert.equal(result.antifraud, null);
  assert.deepEqual(result.deviceSignals, { ip_address: '10.0.0.1' });
});

test('aml.screenSync: is not retried after a 408', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(408, { status: 'Request Timeout', message: 'Provider timed out.' }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await assert.rejects(client.aml.screenSync(amlBase));
  assert.equal(requests.filter((r) => !r.url.endsWith('/v3/token')).length, 1);
});

test('aml.monitor: same body as screen, fullName optional with searchExistingUser', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const accepted = await client.aml.monitor({
    countries: ['NG'],
    userDetails,
    consent,
    searchExistingUser: true,
    userId: 'user-1234',
  });

  assert.equal(accepted.isAccepted, true);
  const req = opRequest(requests);
  assert.match(req.url, /\/v3\/aml\/monitoring$/);
  assert.equal(countParts(req.bodyText, 'full_name'), 0);
  assert.match(req.bodyText, /name="countries"\r\nContent-Type: application\/json\r\n\r\n\["NG"\]\r\n/);
  assert.match(req.bodyText, /name="search_existing_user"\r\n\r\ntrue\r\n/);

  await client.aml.monitor({ ...amlBase });
  const sent = requests.filter((r) => !r.url.endsWith('/v3/token'))[1];
  assert.match(sent.bodyText, /name="full_name"\r\n\r\nJohn Doe\r\n/);
});

test('aml.monitor: requires fullName unless searchExistingUser is true', async () => {
  const { fetch, requests } = routerFetch(() => accepted202('accepted'));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  assert.throws(
    () => client.aml.monitor({ countries: ['NG'], userDetails, consent }),
    (err: Error) => err.message.includes('fullName is required'),
  );
  assert.equal(requests.length, 0);
});

test('aml.monitoringNews: path, query and response parse', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, {
      job_id: 'a1b2c3d4e5',
      product: 'aml_monitoring_news',
      user_id: 'user_123',
      meta: { current_page: 2, limit: 10, total_count: 11 },
      news: [
        {
          body: 'Sample adverse-media content.',
          published_date: '2026-01-15T12:00:00.000Z',
          publisher: 'Example News Publisher',
          publisher_country_code: 'NG',
          title: 'Sample AML Monitoring News Item',
          url: 'https://example.com/news/sample-aml-monitoring',
        },
      ],
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const res = await client.aml.monitoringNews('a1b2c3d4e5', 'ref/001', {
    newsCategory: 'financial_crime',
    page: 2,
    limit: 10,
  });

  const req = opRequest(requests);
  assert.equal(req.method, 'GET');
  assert.equal(
    req.url.replace(/^https?:\/\/[^/]+/, ''),
    '/v3/aml/monitoring/a1b2c3d4e5/news/ref%2F001?news_category=financial_crime&page=2&limit=10',
  );
  assert.equal(req.bodyText, '');
  assert.equal(res.jobId, 'a1b2c3d4e5');
  assert.deepEqual(res.meta, { currentPage: 2, limit: 10, totalCount: 11 });
  assert.equal(res.news[0].publisherCountryCode, 'NG');
  assert.equal(res.news[0].publishedDate, '2026-01-15T12:00:00.000Z');
});

test('aml.monitoringNews: page and limit are omitted when not given', async () => {
  const { fetch, requests } = routerFetch(() =>
    jsonResponse(200, { job_id: 'j', product: 'aml_monitoring_news', user_id: 'u', meta: {}, news: [] }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  await client.aml.monitoringNews('j', 'r', { newsCategory: 'other' });

  assert.match(opRequest(requests).url, /\/news\/r\?news_category=other$/);
});

test('aml.screenSync: a result body missing its free-form objects leaves them undefined', async () => {
  const { fetch } = routerFetch(() => jsonResponse(200, {}));
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });

  const result = await client.aml.screenSync(amlBase);
  assert.equal(result.partnerParams, undefined);
});
