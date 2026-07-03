/**
 * Multipart/form-data serialization (spec §5.3).
 *
 * Built by hand (rather than via the platform FormData) so the exact wire bytes
 * are known: this lets the golden-fixture tests assert the precise structure
 * and keeps JSON object parts free of the spurious `filename="blob"` the
 * platform adds.
 *
 * Rules applied here:
 *  - scalar fields → plain text part;
 *  - object / array fields (consent, user_details, partner_params, metadata) →
 *    one part, body = JSON, Content-Type: application/json;
 *  - single binary fields → one binary part with a filename + content type;
 *  - binary arrays (liveness_images) → one repeated part per image, same name.
 */

import { randomBytes } from 'node:crypto';

import { ValidationError } from '../errors/index.js';

/** A scalar text part (e.g. country, id_type). */
export interface ScalarPart {
  kind: 'scalar';
  name: string;
  value: string;
}
/** A JSON object/array part with Content-Type: application/json. */
export interface JsonPart {
  kind: 'json';
  name: string;
  /** Pre-serialized JSON string. */
  json: string;
}
/** A binary part with a filename and content type. */
export interface BinaryPart {
  kind: 'binary';
  name: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

export type MultipartPart = ScalarPart | JsonPart | BinaryPart;

/** The serialized body plus the Content-Type header value carrying the boundary. */
export interface SerializedMultipart {
  body: Buffer;
  contentType: string;
}

const CRLF = '\r\n';

/** RFC 7230 media-type shape, e.g. image/jpeg or application/json. */
const SAFE_CONTENT_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Strip characters from a caller-supplied filename that would break part
 * framing (RFC 7578): CR, LF, and double quotes.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[\r\n"]/g, '_');
}

/** Reject content types that cannot be interpolated into a part header safely. */
function assertSafeContentType(contentType: string): void {
  if (!SAFE_CONTENT_TYPE.test(contentType)) {
    throw new ValidationError({
      message: `Invalid content type for a multipart part: ${JSON.stringify(contentType)}.`,
    });
  }
}

/** Serialize parts into a multipart/form-data body (spec §5.3). */
export function buildMultipart(parts: MultipartPart[]): SerializedMultipart {
  const boundary = `----smileidFormBoundary${randomBytes(16).toString('hex')}`;
  const segments: Buffer[] = [];

  for (const part of parts) {
    let header = `--${boundary}${CRLF}`;
    if (part.kind === 'binary') {
      assertSafeContentType(part.contentType);
      header += `Content-Disposition: form-data; name="${part.name}"; filename="${sanitizeFilename(part.filename)}"${CRLF}`;
      header += `Content-Type: ${part.contentType}${CRLF}${CRLF}`;
      segments.push(Buffer.from(header, 'utf8'), part.bytes, Buffer.from(CRLF, 'utf8'));
    } else if (part.kind === 'json') {
      header += `Content-Disposition: form-data; name="${part.name}"${CRLF}`;
      header += `Content-Type: application/json${CRLF}${CRLF}`;
      segments.push(Buffer.from(header + part.json + CRLF, 'utf8'));
    } else {
      header += `Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}`;
      segments.push(Buffer.from(header + part.value + CRLF, 'utf8'));
    }
  }

  segments.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));

  return {
    body: Buffer.concat(segments),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
