/**
 * Client configuration and resolution (spec §2.1).
 */

import { ValidationError } from '../errors/index.js';
import { assertHttpsUrl } from '../helpers/validation.js';
import type { Environment } from '../generated/models/index.js';

/** The `fetch` implementation the SDK uses. Injectable for testing/proxies. */
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Public client configuration (spec §2.1). */
export interface SmileIDConfig {
  /** Numeric partner id, no leading zeros. */
  partnerId: string;
  /** Partner API key. */
  apiKey: string;
  /** Environment. Sandbox by default. */
  environment?: Environment;
  /** Used when a call omits callbackUrl. */
  defaultCallbackUrl?: string;
  /** Explicit base URL override; wins over environment. */
  baseUrl?: string;
  /** Per-request total timeout in milliseconds. Default 30000. */
  timeout?: number;
  /** Retries for idempotent operations only. Default 2. */
  maxRetries?: number;
  /** Injectable fetch implementation. Defaults to the global fetch. */
  fetch?: FetchLike;
}

/** Base URLs by environment (spec §2.1 — not in the OpenAPI spec, confirm before release). */
export const BASE_URLS: Record<Environment, string> = {
  sandbox: 'https://testapi.smileidentity.com',
  production: 'https://api.smileidentity.com',
};

/** Fully-resolved configuration with defaults applied. */
export interface ResolvedConfig {
  partnerId: string;
  apiKey: string;
  environment: Environment;
  defaultCallbackUrl: string | null;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  fetch: FetchLike;
}

const PARTNER_ID_PATTERN = /^[1-9]\d*$/;

/** Validate and resolve raw config into {@link ResolvedConfig}. */
export function resolveConfig(config: SmileIDConfig): ResolvedConfig {
  if (!config.partnerId || !PARTNER_ID_PATTERN.test(config.partnerId)) {
    throw new TypeError('partnerId must be a numeric string with no leading zeros.');
  }
  if (!config.apiKey) {
    throw new TypeError('apiKey is required.');
  }
  const environment: Environment = config.environment ?? 'sandbox';
  // Runtime guard for plain-JavaScript callers; the TS union covers TS callers.
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new ValidationError({
      message: 'environment must be "sandbox" or "production".',
    });
  }
  const rawBaseUrl = config.baseUrl ?? BASE_URLS[environment];
  // Fleet standard: absolute https, no query or fragment. No escape hatch.
  assertHttpsUrl(rawBaseUrl, 'baseUrl', { forbidQueryAndFragment: true });
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  if (config.defaultCallbackUrl !== undefined) {
    assertHttpsUrl(config.defaultCallbackUrl, 'defaultCallbackUrl');
  }
  const fetchImpl = config.fetch ?? (globalThis.fetch as FetchLike | undefined);
  if (!fetchImpl) {
    throw new TypeError(
      'No fetch implementation available. Node 18+ provides a global fetch, or pass one via config.fetch.',
    );
  }
  return {
    partnerId: config.partnerId,
    apiKey: config.apiKey,
    environment,
    defaultCallbackUrl: config.defaultCallbackUrl ?? null,
    baseUrl,
    timeout: config.timeout ?? 30000,
    maxRetries: config.maxRetries ?? 2,
    fetch: fetchImpl,
  };
}
