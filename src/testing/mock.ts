/**
 * Test-only helpers for offline HTTP mocking.
 *
 * The transport takes an injectable `fetch` (spec §2.1, config.http_client), so
 * tests mock the network by passing a fake fetch — no server, no extra deps.
 */

import type { FetchLike } from '../client/config.js';

/** A recorded outbound request. */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** The request body decoded to a UTF-8 string (multipart or JSON). */
  bodyText: string;
  /** The raw body bytes, when present. */
  bodyBytes: Buffer | null;
}

/** Build a JWT with the given `exp` (seconds since epoch). Signature is unused. */
export function makeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `${header}.${payload}.signature`;
}

/** Build a JSON Response with a status and optional headers. */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function headersToObject(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const h = init?.headers;
  if (h) {
    for (const [k, v] of Object.entries(h as Record<string, string>)) {
      out[k] = v;
    }
  }
  return out;
}

async function bodyToBuffer(init?: RequestInit): Promise<Buffer | null> {
  const body = init?.body;
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body), 'utf8');
}

/**
 * A fake fetch that records every request and returns queued responses.
 *
 * @param responses  handler per call: a Response, or a function of the request.
 */
export function recordingFetch(
  responses: (Response | ((req: RecordedRequest) => Response))[],
): { fetch: FetchLike; requests: RecordedRequest[]; calls: () => number } {
  const requests: RecordedRequest[] = [];
  let i = 0;
  const fetch: FetchLike = async (input, init) => {
    const bytes = await bodyToBuffer(init);
    const req: RecordedRequest = {
      url: typeof input === 'string' ? input : input.toString(),
      method: init?.method ?? 'GET',
      headers: headersToObject(init),
      bodyText: bytes ? bytes.toString('utf8') : '',
      bodyBytes: bytes,
    };
    requests.push(req);
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    // Clone so a queued Response can be served more than once.
    return typeof next === 'function' ? next(req) : next.clone();
  };
  return { fetch, requests, calls: () => i };
}

/**
 * A router fake fetch: token requests always succeed; other requests are served
 * by the provided handler. Useful when a test only cares about the operation.
 */
export function routerFetch(
  handler: (req: RecordedRequest) => Response,
  opts: { tokenExp?: number } = {},
): { fetch: FetchLike; requests: RecordedRequest[]; tokenCalls: () => number } {
  const requests: RecordedRequest[] = [];
  let tokenCalls = 0;
  const exp = opts.tokenExp ?? Math.floor(Date.now() / 1000) + 3600;
  const fetch: FetchLike = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const bytes = await bodyToBuffer(init);
    const req: RecordedRequest = {
      url,
      method: init?.method ?? 'GET',
      headers: headersToObject(init),
      bodyText: bytes ? bytes.toString('utf8') : '',
      bodyBytes: bytes,
    };
    requests.push(req);
    if (url.endsWith('/v3/token')) {
      tokenCalls += 1;
      return jsonResponse(200, { token: makeJwt(exp) });
    }
    return handler(req);
  };
  return { fetch, requests, tokenCalls: () => tokenCalls };
}

/** A tiny fake JPEG buffer for binary inputs in tests. */
export const FAKE_IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** Six fake liveness images. */
export const FAKE_LIVENESS = Array.from({ length: 6 }, () => FAKE_IMAGE);
