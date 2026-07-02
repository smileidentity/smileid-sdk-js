/**
 * Client configuration and resolution (spec §2.1).
 */

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
  /** When set, enables HMAC request signing (spec §2.5). When unset, HMAC is off. */
  partnerSecret?: string;
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
  partnerSecret: string | null;
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
  const baseUrl = (config.baseUrl ?? BASE_URLS[environment]).replace(/\/+$/, '');
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
    partnerSecret: config.partnerSecret ?? null,
    defaultCallbackUrl: config.defaultCallbackUrl ?? null,
    baseUrl,
    timeout: config.timeout ?? 30000,
    maxRetries: config.maxRetries ?? 2,
    fetch: fetchImpl,
  };
}
