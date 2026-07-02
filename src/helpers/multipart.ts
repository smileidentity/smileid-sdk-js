/**
 * Multipart/form-data serialization (spec §5.3).
 *
 * Built by hand (rather than via the platform FormData) so the exact wire bytes
 * are known: this lets the golden-fixture tests assert the precise structure,
 * lets HMAC signing run over the exact serialized body (spec §2.5), and keeps
 * JSON object parts free of the spurious `filename="blob"` the platform adds.
 *
 * Rules applied here:
 *  - scalar fields → plain text part;
 *  - object / array fields (consent, user_details, partner_params, metadata) →
 *    one part, body = JSON, Content-Type: application/json;
 *  - single binary fields → one binary part with a filename + content type;
 *  - binary arrays (liveness_images) → one repeated part per image, same name.
 */

import { randomBytes } from 'node:crypto';

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

/** Serialize parts into a multipart/form-data body (spec §5.3). */
export function buildMultipart(parts: MultipartPart[]): SerializedMultipart {
  const boundary = `----smileidFormBoundary${randomBytes(16).toString('hex')}`;
  const segments: Buffer[] = [];

  for (const part of parts) {
    let header = `--${boundary}${CRLF}`;
    if (part.kind === 'binary') {
      header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}`;
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
