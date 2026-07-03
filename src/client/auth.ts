/**
 * Internal JWT token lifecycle (spec §2.3, §2A) and the optional HMAC signer (§2.5).
 *
 * Partners never see or pass a token. The manager fetches one from
 * POST /v3/token, caches it until `exp − 60s`, and refreshes on demand. Token
 * fetches are stampede-safe: concurrent callers share a single in-flight
 * promise, so the token endpoint is hit once (JavaScript's single-threaded
 * model makes the in-flight promise the mutex).
 *
 * The fetch itself goes through the transport's execute path, so it gets the
 * same retry policy (the token POST is idempotent, spec §2.6) and the same
 * typed-error mapping (network failures raise ConnectionError) as every other
 * idempotent operation.
 */

import { createHmac } from 'node:crypto';

import { parseError } from '../errors/index.js';
import { decodeJwtExp } from '../helpers/jwt.js';
import type { RequestPlan, TransportResult } from './transport.js';

/** Executes a request plan; provided by the transport. */
export type ExecuteFn = (plan: RequestPlan) => Promise<TransportResult>;

/** Skew subtracted from token expiry so a token is refreshed before it lapses. */
const EXPIRY_SKEW_SECONDS = 60;

interface CachedToken {
  jwt: string;
  /** Epoch milliseconds after which the token must be refreshed. */
  expiresAt: number;
}

/** Manages the internal JWT: fetch, cache, refresh, stampede-safe. */
export class TokenManager {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly partnerId: string,
    private readonly apiKey: string,
    private readonly execute: ExecuteFn,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Return a valid cached token, fetching one if necessary. */
  async ensureToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt) {
      return this.cached.jwt;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Discard the cached token so the next call fetches a fresh one. */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    // The token endpoint documents lowercase header names; send them verbatim.
    // No body is sent. The plan is unauthenticated (no SmileID-Token) and
    // idempotent, so the transport retries transient failures (spec §2.6).
    const result = await this.execute({
      method: 'POST',
      path: '/v3/token',
      authenticated: false,
      needsPartnerIdHeader: false,
      idempotent: true,
      headers: {
        'smileid-partner-id': this.partnerId,
        'smileid-api-key': this.apiKey,
      },
    });
    const jwt = (result.json as { token?: string } | null)?.token;
    if (!jwt) {
      throw parseError({
        statusCode: result.statusCode,
        rawBody: result.rawBody,
        requestId: result.requestId,
      });
    }
    const exp = decodeJwtExp(jwt);
    // A decodable exp caches until exp − skew; an undecodable one refreshes next call.
    const expiresAt = exp !== null ? (exp - EXPIRY_SKEW_SECONDS) * 1000 : this.now();
    this.cached = { jwt, expiresAt };
    return jwt;
  }
}

/**
 * HMAC signing headers (spec §2.5). Signing is optional and enabled only when
 * a partner secret is configured. Signs `timestamp + body bytes`.
 */
export function buildSignatureHeaders(
  partnerSecret: string,
  bodyBytes: Buffer | null,
  now: () => number = () => Date.now(),
): Record<string, string> {
  const timestamp = new Date(now()).toISOString(); // ISO 8601 with milliseconds
  const hmac = createHmac('sha256', partnerSecret);
  hmac.update(timestamp);
  if (bodyBytes) hmac.update(bodyBytes);
  return {
    'SmileID-Timestamp': timestamp,
    'SmileID-Request-Signature': hmac.digest('hex'),
  };
}
