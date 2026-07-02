import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APIError,
  AuthenticationError,
  ConflictError,
  InvalidRequestError,
  NotFoundError,
  parseError,
  PaymentRequiredError,
  PayloadTooLargeError,
  PermissionError,
  RateLimitError,
  SmileIDError,
  errorClassForStatus,
} from './index.js';

// Matrix item 4: error hierarchy — class chosen by HTTP status.
test('errorClassForStatus maps each status to its class (spec §7)', () => {
  assert.equal(errorClassForStatus(400), InvalidRequestError);
  assert.equal(errorClassForStatus(415), InvalidRequestError);
  assert.equal(errorClassForStatus(401), AuthenticationError);
  assert.equal(errorClassForStatus(402), PaymentRequiredError);
  assert.equal(errorClassForStatus(403), PermissionError);
  assert.equal(errorClassForStatus(404), NotFoundError);
  assert.equal(errorClassForStatus(409), ConflictError);
  assert.equal(errorClassForStatus(413), PayloadTooLargeError);
  assert.equal(errorClassForStatus(429), RateLimitError);
  assert.equal(errorClassForStatus(500), APIError);
  assert.equal(errorClassForStatus(503), APIError);
});

test('parseError handles the {status, message} wire shape', () => {
  const err = parseError({
    statusCode: 402,
    rawBody: JSON.stringify({ status: 'Payment Required', message: 'Insufficient wallet balance.' }),
    requestId: 'req_1',
  });
  assert.ok(err instanceof PaymentRequiredError);
  assert.equal(err.statusCode, 402);
  assert.equal(err.status, 'Payment Required');
  assert.equal(err.message, 'Insufficient wallet balance.');
  assert.equal(err.code, null);
  assert.equal(err.requestId, 'req_1');
});

test('parseError handles the {error, code} services wire shape', () => {
  const err = parseError({
    statusCode: 403,
    rawBody: JSON.stringify({ error: 'You are not authorized to do that.', code: '2413' }),
    requestId: null,
  });
  assert.ok(err instanceof PermissionError);
  assert.equal(err.statusCode, 403);
  assert.equal(err.message, 'You are not authorized to do that.');
  assert.equal(err.code, '2413');
  assert.equal(err.status, null);
});

test('parseError handles the {message, status} id_status ordering', () => {
  const err = parseError({
    statusCode: 400,
    rawBody: JSON.stringify({ message: '"country" is required', status: 'Bad Request' }),
    requestId: null,
  });
  assert.ok(err instanceof InvalidRequestError);
  assert.equal(err.message, '"country" is required');
  assert.equal(err.status, 'Bad Request');
});

test('parseError falls back when the body is not JSON', () => {
  const err = parseError({ statusCode: 500, rawBody: '<html>oops</html>', requestId: null });
  assert.ok(err instanceof APIError);
  assert.equal(err.rawBody, '<html>oops</html>');
  assert.match(err.message, /500/);
});

test('every error is an instanceof SmileIDError with the right name', () => {
  const err = new AuthenticationError({ message: 'nope', statusCode: 401 });
  assert.ok(err instanceof SmileIDError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'AuthenticationError');
});
