import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ValidationError } from '../errors/index.js';
import {
  validateAuthentication,
  validateDocumentVerification,
  validateEnhancedKyc,
  validateIdStatus,
  validateReportFraud,
  validateUserDetails,
} from './validation.js';
import { SmileID } from '../client/client.js';
import { FAKE_IMAGE, FAKE_LIVENESS } from '../testing/mock.js';

// Matrix item 6: client-side validation.
test('validateUserDetails passes with an email', () => {
  assert.doesNotThrow(() =>
    validateUserDetails({ givenNames: 'John', lastName: 'Doe', email: 'john@example.com' }),
  );
});

test('validateUserDetails passes with a phone number', () => {
  assert.doesNotThrow(() =>
    validateUserDetails({ givenNames: 'John', lastName: 'Doe', phoneNumber: '+2348012345678' }),
  );
});

test('validateUserDetails rejects when neither email nor phone is present', () => {
  assert.throws(
    () => validateUserDetails({ givenNames: 'John', lastName: 'Doe' }),
    ValidationError,
  );
});

test('validateReportFraud requires reason when isFraud is true', () => {
  assert.throws(
    () => validateReportFraud({ isFraud: true, reportedBy: 'ops@example.com' }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    validateReportFraud({
      isFraud: true,
      reason: 'ACCOUNT_TAKEOVER',
      reportedBy: 'ops@example.com',
    }),
  );
});

test('validateReportFraud requires notes when isFraud is false', () => {
  assert.throws(
    () => validateReportFraud({ isFraud: false, reportedBy: 'ops@example.com' }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    validateReportFraud({ isFraud: false, notes: 'cleared', reportedBy: 'ops@example.com' }),
  );
});

test('validateReportFraud requires notes when reason is OTHER', () => {
  assert.throws(
    () =>
      validateReportFraud({ isFraud: true, reason: 'OTHER', reportedBy: 'ops@example.com' }),
    ValidationError,
  );
});

test('validateAuthentication requires images unless useEnrolledImage', () => {
  const base = {
    userId: 'user_1',
    consent: {
      granted: true as const,
      grantedAt: '2026-03-06T12:00:00.000Z',
      noticeLanguage: 'EN',
      noticePrivacyPolicyUrl: 'https://example.com/privacy',
    },
    userDetails: { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' },
  };
  assert.throws(() => validateAuthentication(base), ValidationError);
  assert.doesNotThrow(() => validateAuthentication({ ...base, useEnrolledImage: true }));
  assert.doesNotThrow(() =>
    validateAuthentication({ ...base, selfieImage: FAKE_IMAGE, livenessImages: FAKE_LIVENESS }),
  );
});

test('entry validators enforce required fields and liveness count', () => {
  const common = {
    userDetails: { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' },
    consent: {
      granted: true as const,
      grantedAt: '2026-03-06T12:00:00.000Z',
      noticeLanguage: 'EN',
      noticePrivacyPolicyUrl: 'https://example.com/privacy',
    },
  };
  assert.throws(
    () => validateEnhancedKyc({ ...common, country: '', idType: 'NIN', idNumber: '1' }),
    ValidationError,
  );
  assert.throws(
    () =>
      validateDocumentVerification({
        ...common,
        country: 'NG',
        selfieImage: FAKE_IMAGE,
        livenessImages: FAKE_LIVENESS.slice(0, 5),
        document: FAKE_IMAGE,
      }),
    ValidationError,
  );
});

test('idStatus requires country and idType', () => {
  assert.throws(() => validateIdStatus({ country: 'NG', idType: '' }), ValidationError);
});

// Cross-SDK standard: verifyEnhanced enforces idType client-side (spec §6.3),
// including for plain-JavaScript callers who bypass the compile-time check.
test('documents.verifyEnhanced rejects a missing idType before sending', () => {
  const fetch = async (): Promise<Response> => {
    throw new Error('no request should be sent');
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const params = {
    country: 'NG',
    selfieImage: FAKE_IMAGE,
    livenessImages: FAKE_LIVENESS,
    document: FAKE_IMAGE,
    userDetails: { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' },
    consent: {
      granted: true as const,
      grantedAt: '2026-03-06T12:00:00.000Z',
      noticeLanguage: 'EN',
      noticePrivacyPolicyUrl: 'https://example.com/privacy',
    },
  };
  assert.throws(
    () =>
      client.documents.verifyEnhanced(
        params as unknown as Parameters<typeof client.documents.verifyEnhanced>[0],
      ),
    ValidationError,
  );
});

test('request callback URL must use HTTPS', async () => {
  const fetch = async (): Promise<Response> => {
    throw new Error('no request should be sent');
  };
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  await assert.rejects(
    () =>
      client.enhancedKyc.verify({
        country: 'NG',
        idType: 'NIN',
        idNumber: '12345678901',
        userDetails: { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' },
        consent: {
          granted: true,
          grantedAt: '2026-03-06T12:00:00.000Z',
          noticeLanguage: 'EN',
          noticePrivacyPolicyUrl: 'https://example.com/privacy',
        },
        callbackUrl: 'http://partner.example.com/webhook',
      }),
    TypeError,
  );
});
