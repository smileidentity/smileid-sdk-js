/**
 * The single internal transport (spec §2.2, §2.6, §2A).
 *
 * Every resource method funnels through here. It builds the URL, attaches auth
 * and telemetry headers, optionally signs, serializes the body, sends, applies
 * the retry policy, and parses the response into a typed result or error. It is
 * the only layer that touches HTTP.
 */

import { ConnectionError, parseError } from '../errors/index.js';
import { buildSignatureHeaders, TokenManager } from './auth.js';
import type { ResolvedConfig } from './config.js';
import type { SerializedMultipart } from '../helpers/multipart.js';
import { VERSION } from '../version.js';

/** HTTP statuses that are retryable for idempotent operations (spec §2.6). */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Base backoff in ms (SDK choice — not in the spec). */
const BACKOFF_BASE_MS = 50;

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
  /** JSON body (replay only). */
  json?: unknown;
  /** When true, a final 404 returns the parsed body instead of raising (spec §6.8). */
  allow404?: boolean;
  /** Per-request options. */
  timeout?: number;
  signal?: AbortSignal;
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

/** Backoff delay in ms: honour Retry-After when present, else exponential + jitter. */
export function computeBackoff(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds !== null && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }
  const exponential = BACKOFF_BASE_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * BACKOFF_BASE_MS);
  return exponential + jitter;
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into ms-from-now seconds. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return null;
}

export class Transport {
  readonly tokenManager: TokenManager;

  constructor(
    private readonly config: ResolvedConfig,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.tokenManager = new TokenManager(config.partnerId, config.apiKey, (plan) =>
      this.execute(plan),
    );
  }

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

  /** Execute a request plan, applying auth, signing, retries, and error parsing. */
  async execute(plan: RequestPlan): Promise<TransportResult> {
    const url = this.buildUrl(plan);
    let attempt = 0;
    let authRefreshed = false;

    for (;;) {
      if (plan.signal?.aborted) {
        throw new ConnectionError({ message: 'Request aborted.' });
      }
      const headers: Record<string, string> = { ...this.telemetryHeaders() };
      for (const [k, v] of Object.entries(plan.headers ?? {})) {
        if (v !== undefined) headers[k] = v;
      }
      if (plan.needsPartnerIdHeader) headers['SmileID-Partner-ID'] = this.config.partnerId;
      if (plan.authenticated) {
        headers['SmileID-Token'] = await this.tokenManager.ensureToken();
      }

      let body: Buffer | string | undefined;
      let bodyBytes: Buffer | null = null;
      if (plan.multipart) {
        headers['Content-Type'] = plan.multipart.contentType;
        body = plan.multipart.body;
        bodyBytes = plan.multipart.body;
      } else if (plan.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(plan.json);
        bodyBytes = Buffer.from(body, 'utf8');
      }

      if (this.config.partnerSecret) {
        Object.assign(headers, buildSignatureHeaders(this.config.partnerSecret, bodyBytes));
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
        return { statusCode: resp.status, json: safeJson(rawBody), rawBody, requestId };
      }

      // Refresh-on-401 once, then surface AuthenticationError (spec §2.3 item 5).
      if (resp.status === 401 && plan.authenticated && !authRefreshed) {
        this.tokenManager.invalidate();
        authRefreshed = true;
        continue;
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

  private buildUrl(plan: RequestPlan): string {
    const url = new URL(this.config.baseUrl + plan.path);
    for (const [k, v] of Object.entries(plan.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    return url.toString();
  }
}

function safeJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
