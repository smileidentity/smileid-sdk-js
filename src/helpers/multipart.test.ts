import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMultipart, sanitizeFilename } from './multipart.js';
import { ValidationError } from '../errors/index.js';

// A hostile filename must not be able to break part framing (RFC 7578).
test('hostile filenames are sanitized before interpolation', () => {
  const { body } = buildMultipart([
    {
      kind: 'binary',
      name: 'document',
      filename: 'evil".jpg\r\nX-Injected: yes\r\n\r\npayload',
      contentType: 'image/jpeg',
      bytes: Buffer.from([0xff]),
    },
  ]);
  const text = body.toString('utf8');
  assert.ok(!text.includes('\r\nX-Injected'), 'no injected header line survives');
  assert.match(text, /filename="evil_.jpg__X-Injected: yes____payload"/);
  // The part header block stays exactly two lines.
  const headerBlock = text.split('\r\n\r\n')[0];
  assert.equal(headerBlock.split('\r\n').length, 3, 'boundary + disposition + content-type only');
});

test('sanitizeFilename strips CR, LF and double quotes', () => {
  assert.equal(sanitizeFilename('a"b\rc\nd.jpg'), 'a_b_c_d.jpg');
  assert.equal(sanitizeFilename('plain.jpg'), 'plain.jpg');
});

test('an unsafe content type is rejected', () => {
  assert.throws(
    () =>
      buildMultipart([
        {
          kind: 'binary',
          name: 'document',
          filename: 'doc.jpg',
          contentType: 'image/jpeg\r\nX-Injected: yes',
          bytes: Buffer.from([0xff]),
        },
      ]),
    ValidationError,
  );
});
