/**
 * Resolve a {@link BinaryInput} to raw bytes plus a filename and content type
 * for a multipart part (spec §5.3, §8).
 *
 * Accepts a filesystem path, a Buffer/Uint8Array, a Blob, a readable stream, or
 * a wrapper `{ data, filename?, contentType? }` to override the defaults.
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';

import type { BinaryInput } from '../generated/models/index.js';

/** A binary part ready to serialize. */
export interface ResolvedBinary {
  bytes: Buffer;
  filename: string;
  contentType: string;
}

function isReadable(value: unknown): value is Readable {
  return (
    value instanceof Readable ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as { pipe?: unknown }).pipe === 'function')
  );
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

async function resolveData(
  data: string | Buffer | Uint8Array | Blob | Readable,
): Promise<{ bytes: Buffer; filename?: string; contentType?: string }> {
  if (typeof data === 'string') {
    return { bytes: await readFile(data), filename: basename(data) };
  }
  if (Buffer.isBuffer(data)) {
    return { bytes: data };
  }
  if (data instanceof Uint8Array) {
    return { bytes: Buffer.from(data) };
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buf = Buffer.from(await data.arrayBuffer());
    return { bytes: buf, contentType: data.type || undefined };
  }
  if (isReadable(data)) {
    return { bytes: await streamToBuffer(data) };
  }
  throw new TypeError('Unsupported binary input type.');
}

/**
 * Resolve a binary input to bytes + filename + content type.
 *
 * @param input        the caller-supplied binary
 * @param defaultName  filename to use when the input does not carry one
 * @param defaultType  content type to use when the input does not carry one
 */
export async function resolveBinary(
  input: BinaryInput,
  defaultName: string,
  defaultType: string,
): Promise<ResolvedBinary> {
  if (
    typeof input === 'object' &&
    input !== null &&
    'data' in input &&
    !Buffer.isBuffer(input) &&
    !(input instanceof Uint8Array) &&
    !(typeof Blob !== 'undefined' && input instanceof Blob) &&
    !isReadable(input)
  ) {
    const wrapper = input;
    const resolved = await resolveData(wrapper.data);
    return {
      bytes: resolved.bytes,
      filename: wrapper.filename ?? resolved.filename ?? defaultName,
      contentType: wrapper.contentType ?? resolved.contentType ?? defaultType,
    };
  }
  const resolved = await resolveData(input);
  return {
    bytes: resolved.bytes,
    filename: resolved.filename ?? defaultName,
    contentType: resolved.contentType ?? defaultType,
  };
}
