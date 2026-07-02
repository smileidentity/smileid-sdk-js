import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ValidationError } from '../errors/index.js';
import {
  validateAuthentication,
  validateReportFraud,
  validateUserDetails,
} from './validation.js';
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
