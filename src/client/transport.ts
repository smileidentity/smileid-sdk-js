/**
 * The single internal transport (spec §2.2, §2.6, §2A).
 *
 * Every resource method funnels through here. It builds the URL, attaches auth
 * and telemetry headers, serializes the body, sends, applies
 * the retry policy, and parses the response into a typed result or error. It is
 * the only layer that touches HTTP.
 */

import {
  ConnectionError,
  parseError,
  UnexpectedResponseError,
  ValidationError,
} from '../errors/index.js';
import type { ResolvedConfig } from './config.js';
import { buildMultipart, type MultipartPart, type SerializedMultipart } from '../helpers/multipart.js';
import { VERSION } from '../version.js';

/** HTTP statuses that are retryable for idempotent operations (spec §2.6). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Base backoff in ms (SDK choice — not in the spec). */
const BACKOFF_BASE_MS = 50;

/** Cap on an honoured Retry-After delay (cross-SDK standard). */
const RETRY_AFTER_CAP_SECONDS = 60;

// Mirrors the API authorizer: a token bound to a product is accepted only on
// that product's endpoint. Paths absent here mint a token with no claims.
const PRODUCT_BY_PATH: Record<string, string> = {
  '/v3/enhanced_kyc': 'enhanced_kyc',
  '/v3/document_verification': 'document_verification',
  '/v3/enhanced_document_verification': 'enhanced_document_verification',
  '/v3/residency_document_verification': 'residency_document_verification',
  '/v3/biometric_kyc': 'biometric_kyc',
  '/v3/registration': 'smart_selfie_registration',
  '/v3/authentication': 'smart_selfie_authentication',
  '/v3/compare': 'smart_selfie_compare',
};

/** A fully-described request for {@link Transport.execute}. */
export interface RequestPlan {
  method: 'GET' | 'POST';
  /** Path with placeholders already substituted (e.g. /v3/status/job_123). */
  path: string;
  authenticated: boolean;
  needsPartnerIdHeader: boolean;
  /** True only for GETs and the token fetch (spec §2.6). */
  idempotent: boolean;
  query?: Record<string, string | undefined>;
  /** Operation-specific headers (e.g. User-ID). */
  headers?: Record<string, string | undefined>;
  /** Multipart body, when the operation sends one. */
  multipart?: SerializedMultipart;
  /** When true, a final 404 returns the parsed body instead of raising (spec §6.8). */
  allow404?: boolean;
  /** Per-request options. */
  timeout?: number;
  signal?: AbortSignal;
}

/** Transport-level options that are never part of a request plan. */
export interface ExecuteOptions {
  /** Bind the enrolled-image grant into the request's token (never sent in the job body). */
  useEnrolledImage?: boolean;
}

/** The parsed outcome of a request. */
export interface TransportResult {
  statusCode: number;
  /** Parsed JSON body, or null if the body was empty / not JSON. */
  json: unknown;
  rawBody: string;
  requestId: string | null;
}

/** Should this attempt be retried, given the operation and outcome (spec §2A). */
export function shouldRetry(
  idempotent: boolean,
  attempt: number,
  maxRetries: number,
  statusCode: number | null,
): boolean {
  if (attempt >= maxRetries) return false;
  if (!idempotent) return false;
  // 409 is explicitly excluded (business-state conflict, not transient).
  if (statusCode === null) return true; // connection error
  return RETRYABLE_STATUSES.has(statusCode);
}

/**
 * Backoff delay in ms: honour Retry-After when present (capped at 60s),
 * else exponential + jitter.
 */
export function computeBackoff(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds !== null && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds, RETRY_AFTER_CAP_SECONDS) * 1000;
  }
  const exponential = BACKOFF_BASE_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * BACKOFF_BASE_MS);
  return exponential + jitter;
}

/**
 * Parse a Retry-After header into seconds from now. Both RFC 7231 forms are
 * honoured: delta-seconds ("2") and HTTP-date ("Wed, 01 Jul 2026 12:00:05 GMT").
 */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return null;
}

export class Transport {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** The client-wide default callback URL, or null (spec §2.1). */
  get defaultCallbackUrl(): string | null {
    return this.config.defaultCallbackUrl;
  }

  /** Telemetry headers, sent on every request (spec §2.4). */
  telemetryHeaders(): Record<string, string> {
    return {
      'SmileID-Source-SDK': 'node',
      'SmileID-Source-SDK-Version': VERSION,
      'User-Agent': `smileid-sdk-node/${VERSION} (node/${process.version.replace(/^v/, '')})`,
    };
  }

  /** A view of this transport whose requests carry the enrolled-image grant in their token. */
  withEnrolledImageGrant(): Transport {
    const granting = Object.create(this) as Transport;
    granting.execute = (plan) => this.execute(plan, { useEnrolledImage: true });
    return granting;
  }

  /** Execute a request plan, applying auth, retries, and error parsing. */
  async execute(plan: RequestPlan, options: ExecuteOptions = {}): Promise<TransportResult> {
    const url = this.buildUrl(plan);
    let attempt = 0;
    const token = plan.authenticated
      ? await this.mintToken(plan, options.useEnrolledImage === true)
      : undefined;

    for (;;) {
      if (plan.signal?.aborted) {
        throw new ConnectionError({ message: 'Request aborted.' });
      }
      const headers: Record<string, string> = { ...this.telemetryHeaders() };
      for (const [k, v] of Object.entries(plan.headers ?? {})) {
        if (v !== undefined) headers[k] = v;
      }
      if (plan.needsPartnerIdHeader) headers['SmileID-Partner-ID'] = this.config.partnerId;
      if (token !== undefined) headers['SmileID-Token'] = token;

      let body: Buffer | string | undefined;
      if (plan.multipart) {
        headers['Content-Type'] = plan.multipart.contentType;
        body = plan.multipart.body;
      }

      const controller = new AbortController();
      const timeoutMs = plan.timeout ?? this.config.timeout;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = (): void => controller.abort();
      plan.signal?.addEventListener('abort', onAbort);

      let resp: Response;
      try {
        resp = await this.config.fetch(url, {
          method: plan.method,
          headers,
          body: body as RequestInit['body'],
          signal: controller.signal,
        });
      } catch (err) {
        // A caller-initiated abort is not a transient fault: never retry it.
        if (plan.signal?.aborted) {
          throw new ConnectionError({ message: 'Request aborted.' });
        }
        if (shouldRetry(plan.idempotent, attempt, this.config.maxRetries, null)) {
          await this.sleep(computeBackoff(attempt, null));
          attempt += 1;
          continue;
        }
        throw new ConnectionError({
          message: err instanceof Error ? err.message : 'Network request failed.',
        });
      } finally {
        clearTimeout(timer);
        plan.signal?.removeEventListener('abort', onAbort);
      }

      const rawBody = await resp.text();
      const requestId = resp.headers.get('x-request-id');

      if (resp.status >= 200 && resp.status < 300) {
        const json = safeJson(rawBody);
        // Fleet standard: a success body must be a JSON object. The
        // retrieve 404 → not_found path below is unaffected.
        if (json === null || typeof json !== 'object' || Array.isArray(json)) {
          throw new UnexpectedResponseError({
            statusCode: resp.status,
            message: 'Expected a JSON object in the response body.',
            rawBody,
            requestId,
          });
        }
        return { statusCode: resp.status, json, rawBody, requestId };
      }

      if (plan.allow404 && resp.status === 404) {
        return { statusCode: resp.status, json: safeJson(rawBody), rawBody, requestId };
      }

      if (shouldRetry(plan.idempotent, attempt, this.config.maxRetries, resp.status)) {
        const retryAfter = parseRetryAfter(resp.headers.get('retry-after'));
        await this.sleep(computeBackoff(attempt, retryAfter));
        attempt += 1;
        continue;
      }

      throw parseError({ statusCode: resp.status, rawBody, requestId });
    }
  }

  /**
   * Mint a token bound to this one request's user, product and grant. Tokens
   * are never shared: a grant authorises a captureless job for one user and
   * must not reach any other call.
   */
  private async mintToken(plan: RequestPlan, useEnrolledImage: boolean): Promise<string> {
    const product = PRODUCT_BY_PATH[plan.path];
    const userId = product === undefined ? undefined : jobUserId(plan);
    if (useEnrolledImage && userId === undefined) {
      throw new ValidationError({
        message: 'userId is required when useEnrolledImage is true.',
      });
    }
    const parts: MultipartPart[] = [];
    const claim = (name: string, value: string | undefined): void => {
      if (value !== undefined) parts.push({ kind: 'scalar', name, value });
    };
    claim('user_id', userId);
    claim('product', product);
    if (useEnrolledImage) claim('use_enrolled_image', 'true');
    // The token endpoint documents lowercase header names; send them verbatim.
    const result = await this.execute({
      method: 'POST',
      path: '/v3/token',
      authenticated: false,
      needsPartnerIdHeader: false,
      idempotent: true,
      headers: {
        'smileid-partner-id': this.config.partnerId,
        'smileid-api-key': this.config.apiKey,
      },
      ...(parts.length > 0 ? { multipart: buildMultipart(parts) } : {}),
      ...(plan.signal ? { signal: plan.signal } : {}),
      ...(plan.timeout !== undefined ? { timeout: plan.timeout } : {}),
    });
    const token = (result.json as { token?: unknown } | null)?.token;
    if (typeof token !== 'string' || token === '') {
      throw new UnexpectedResponseError({
        statusCode: result.statusCode,
        message: 'The token response did not contain a token.',
        rawBody: result.rawBody,
        requestId: result.requestId,
      });
    }
    return token;
  }

  private buildUrl(plan: RequestPlan): string {
    const url = new URL(this.config.baseUrl + plan.path);
    for (const [k, v] of Object.entries(plan.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    return url.toString();
  }
}

/**
 * The user a job names, from its User-ID header or its body. The API trims
 * the header but not the token's user_id claim, so a padded id would mint a
 * token for a different user than the job names.
 */
function jobUserId(plan: RequestPlan): string | undefined {
  const userId =
    plan.headers?.['User-ID'] ?? plan.multipart?.textParts.find(([n]) => n === 'user_id')?.[1];
  if (userId !== undefined && (userId === '' || userId !== userId.trim())) {
    throw new ValidationError({
      message: 'userId must not be empty or padded with whitespace.',
    });
  }
  return userId;
}

function safeJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
