/**
 * Error hierarchy (spec §7).
 *
 * One base class, {@link SmileIDError}, with typed subclasses keyed on HTTP
 * status. Every error exposes the same accessor fields so callers can inspect
 * a failure uniformly regardless of which wire error shape produced it.
 */

/** Fields shared by every SDK error. */
export interface SmileIDErrorFields {
  /** HTTP status code, or null for connection / SDK-local errors. */
  statusCode: number | null;
  /** HTTP status text from the response body when present (e.g. "Bad Request"). */
  status: string | null;
  /** Human-readable message. */
  message: string;
  /** Machine code, present only on the services `{error, code}` wire shape. */
  code: string | null;
  /** Request id from a response header when one exists, else null. */
  requestId: string | null;
  /** The unparsed response body, when there was one. */
  rawBody: string | null;
}

/** Base class for every error raised by the SDK. */
export class SmileIDError extends Error {
  readonly statusCode: number | null;
  readonly status: string | null;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly rawBody: string | null;

  constructor(fields: Partial<SmileIDErrorFields> & { message: string }) {
    super(fields.message);
    this.name = new.target.name;
    this.statusCode = fields.statusCode ?? null;
    this.status = fields.status ?? null;
    this.code = fields.code ?? null;
    this.requestId = fields.requestId ?? null;
    this.rawBody = fields.rawBody ?? null;
    // Restore prototype chain when compiled down to older targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 / 415 — malformed or unsupported request. Also used for local validation. */
export class InvalidRequestError extends SmileIDError {}
/** 401 — authentication failed (raised after a failed token refresh). */
export class AuthenticationError extends SmileIDError {}
/** 402 — insufficient wallet balance. */
export class PaymentRequiredError extends SmileIDError {}
/** 403 — not authorized (includes the services `{error, code}` shape). */
export class PermissionError extends SmileIDError {}
/** 404 — resource not found. Not raised by `verifications.retrieve` (see §6.8). */
export class NotFoundError extends SmileIDError {}
/** 409 — business-state conflict (e.g. replay while still processing). Never auto-retried. */
export class ConflictError extends SmileIDError {}
/** 413 — request payload too large. */
export class PayloadTooLargeError extends SmileIDError {}
/** 429 — rate limited. */
export class RateLimitError extends SmileIDError {}
/** 5xx — server-side API error. */
export class APIError extends SmileIDError {}
/** Network failure or transport error with no HTTP response. */
export class ConnectionError extends SmileIDError {}
/** SDK-local: raised by `verifications.waitUntilComplete` when the deadline passes. */
export class TimeoutError extends SmileIDError {}
/** SDK-local: client-side validation failure raised before a request is sent. */
export class ValidationError extends InvalidRequestError {}

/** Map an HTTP status code to the matching error class (spec §7 table). */
export function errorClassForStatus(status: number): new (
  fields: Partial<SmileIDErrorFields> & { message: string },
) => SmileIDError {
  if (status === 400 || status === 415) return InvalidRequestError;
  if (status === 401) return AuthenticationError;
  if (status === 402) return PaymentRequiredError;
  if (status === 403) return PermissionError;
  if (status === 404) return NotFoundError;
  if (status === 409) return ConflictError;
  if (status === 413) return PayloadTooLargeError;
  if (status === 429) return RateLimitError;
  if (status >= 500) return APIError;
  // Any other 4xx we do not model explicitly is treated as an invalid request.
  return InvalidRequestError;
}

/** A minimal view of a parsed HTTP response, enough for {@link parseError}. */
export interface ErrorSource {
  statusCode: number;
  rawBody: string | null;
  requestId: string | null;
}

/**
 * Turn a failed HTTP response into a typed error (spec §2A `parse_error`).
 *
 * Handles both wire shapes: `{status, message}` (used almost everywhere, and
 * `{message, status}` on id_status — same keys, any order) and `{error, code}`
 * (the three unauthenticated services endpoints). The class is chosen by HTTP
 * status, never by body contents.
 */
export function parseError(source: ErrorSource): SmileIDError {
  let body: Record<string, unknown> | null = null;
  if (source.rawBody) {
    try {
      const parsed: unknown = JSON.parse(source.rawBody);
      if (parsed && typeof parsed === 'object') {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = null;
    }
  }

  const message =
    (typeof body?.message === 'string' && body.message) ||
    (typeof body?.error === 'string' && body.error) ||
    `Request failed with status ${source.statusCode}`;
  const code = typeof body?.code === 'string' ? body.code : null;
  const status = typeof body?.status === 'string' ? body.status : null;

  const ErrorClass = errorClassForStatus(source.statusCode);
  return new ErrorClass({
    statusCode: source.statusCode,
    status,
    message,
    code,
    requestId: source.requestId,
    rawBody: source.rawBody,
  });
}
