import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';

import { run, UsageError } from './app.js';

type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText: string;
};

class Capture extends Writable {
  text = '';
  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.text += chunk.toString();
    callback();
  }
}

void test('services command lists reference data without authentication', async () => {
  const fake = fakeFetch();
  const out = new Capture();
  await run({
    argv: ['--base-url', 'https://api.test', 'services', '--country', 'NG'],
    env: testEnv(),
    stdout: out,
    fetch: fake.fetch,
  });

  const result = JSON.parse(out.text) as { country: string; bankCodes: { code: string }[]; idTypes: { type: string }[] };
  assert.equal(result.country, 'NG');
  assert.equal(result.bankCodes[0]?.code, '001');
  assert.equal(result.idTypes[0]?.type, 'NIN');
  assert.equal(fake.tokenCalls, 0);
});

void test('enhanced-kyc submits a verification through the SDK', async () => {
  const fake = fakeFetch();
  const out = new Capture();
  await run({
    argv: [
      '--base-url',
      'https://api.test',
      '--callback-url',
      'https://example.com/smile-callback',
      'enhanced-kyc',
      '--country',
      'NG',
      '--id-type',
      'NIN',
      '--id-number',
      '12345678901',
      '--given-names',
      'Amina Fatou',
      '--last-name',
      'Clearwater',
      '--email',
      'amina.clearwater@example.com',
    ],
    env: testEnv(),
    stdout: out,
    fetch: fake.fetch,
  });

  const result = JSON.parse(out.text) as { jobId: string; accepted: boolean };
  assert.equal(result.jobId, 'job_enhanced_123');
  assert.equal(result.accepted, true);
  assert.equal(fake.tokenCalls, 1);
  const request = fake.requests.find((r) => r.url.endsWith('/v3/enhanced_kyc'));
  assert.ok(request);
  assert.match(request.bodyText, /name="country"\r\n\r\nNG/);
  assert.match(request.bodyText, /name="id_type"\r\n\r\nNIN/);
  assert.match(request.bodyText, /name="callback_url"\r\n\r\nhttps:\/\/example.com\/smile-callback/);
  assert.match(request.bodyText, /"given_names":"Amina Fatou"/);
  assert.match(request.bodyText, /"last_name":"Clearwater"/);
});

void test('status command retrieves a verification', async () => {
  const fake = fakeFetch();
  const out = new Capture();
  await run({
    argv: ['--base-url', 'https://api.test', 'status', '--job-id', 'job_enhanced_123'],
    env: testEnv(),
    stdout: out,
    fetch: fake.fetch,
  });
  const result = JSON.parse(out.text) as { status: string; message: string };
  assert.equal(result.status, 'clear');
  assert.equal(result.message, 'Job completed');
});

// A global flag placed after the command name used to be dropped silently,
// which sent the request to the default host instead of --base-url.
void test('global flags are honoured after the command name', async () => {
  const fake = fakeFetch();
  const out = new Capture();
  await run({
    argv: ['status', '--job-id', 'job_enhanced_123', '--base-url', 'https://api.test'],
    env: testEnv(),
    stdout: out,
    fetch: fake.fetch,
  });
  assert.equal((JSON.parse(out.text) as { status: string }).status, 'clear');
  assert.ok(fake.requests.every((r) => r.url.startsWith('https://api.test/')));
});

void test('an unknown global flag before the command is a usage error', async () => {
  await assert.rejects(
    () => run({ argv: ['--nope', 'x', 'services'], env: testEnv(), stdout: new Capture() }),
    (error: unknown) => error instanceof UsageError && /unknown global flag --nope/.test(error.message),
  );
});

void test('replay command requests callback replay', async () => {
  const fake = fakeFetch();
  const out = new Capture();
  await run({
    argv: [
      '--base-url',
      'https://api.test',
      'replay',
      '--job-id',
      'job_enhanced_123',
      '--callback-url',
      'https://example.com/replay-callback',
    ],
    env: testEnv(),
    stdout: out,
    fetch: fake.fetch,
  });
  const result = JSON.parse(out.text) as { status: string; jobId: string };
  assert.equal(result.status, 'success');
  assert.equal(result.jobId, 'job_enhanced_123');
  const request = fake.requests.find((r) => r.url.endsWith('/v3/replay/job_enhanced_123'));
  assert.ok(request);
  // Replay sends multipart/form-data: one text part named callback_url.
  assert.match(
    request.bodyText,
    /Content-Disposition: form-data; name="callback_url"\r\n\r\nhttps:\/\/example.com\/replay-callback\r\n/,
  );
});

void test('help does not require credentials', async () => {
  const out = new Capture();
  await run({ argv: ['help'], env: {}, stdout: out });
  assert.match(out.text, /Usage:/);
});

void test('missing credentials returns a usage error', async () => {
  await assert.rejects(
    () => run({ argv: ['services'], env: {}, stdout: new Capture() }),
    (error: unknown) => error instanceof UsageError && /SMILE_PARTNER_ID/.test(error.message),
  );
});

function testEnv(): Record<string, string> {
  return {
    SMILE_PARTNER_ID: '12345',
    SMILE_API_KEY: 'test-api-key',
  };
}

function fakeFetch(): {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  requests: RecordedRequest[];
  tokenCalls: number;
} {
  const state = {
    requests: [] as RecordedRequest[],
    tokenCalls: 0,
  };
  return {
    get requests() {
      return state.requests;
    },
    get tokenCalls() {
      return state.tokenCalls;
    },
    fetch: async (input, init) => {
      const bodyText = init?.body ? await new Response(init.body).text() : '';
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const req = {
        url: input.toString(),
        method: init?.method ?? 'GET',
        headers,
        bodyText,
      };
      state.requests.push(req);

      if (req.url.endsWith('/v3/token')) {
        state.tokenCalls += 1;
        assert.equal(headers['smileid-partner-id'], '12345');
        assert.equal(headers['smileid-api-key'], 'test-api-key');
        return json(200, { token: makeJwt() });
      }
      if (req.url.endsWith('/v3/services/bank_codes?country=NG')) {
        return json(200, { bank_codes: [{ code: '001', country: 'NG', name: 'Example Bank' }] });
      }
      if (req.url.endsWith('/v3/services/supported_id_types?country=NG')) {
        return json(200, {
          id_types: [{ country: 'NG', label: 'National Identification Number', regex: '^\\d{11}$', required_fields: ['id_number'], type: 'NIN' }],
        });
      }
      if (req.url.endsWith('/v3/services/supported_documents?country_code=NG')) {
        return json(200, {
          valid_documents: [{ country: { code: 'NG', name: 'Nigeria', continent: 'Africa' }, id_types: [{ code: 'PASSPORT', name: 'Passport', example: ['A12345678'], has_back: false }] }],
        });
      }
      if (req.url.endsWith('/v3/enhanced_kyc')) {
        assert.match(headers['smileid-token'] ?? '', /^eyJ/);
        return json(202, { status: 'Accepted', message: 'submitted', job_id: 'job_enhanced_123', user_id: 'user_123' });
      }
      if (req.url.endsWith('/v3/status/job_enhanced_123')) {
        assert.match(headers['smileid-token'] ?? '', /^eyJ/);
        return json(200, { status: 'clear', message: 'Job completed', job_id: 'job_enhanced_123', user_id: 'user_123' });
      }
      if (req.url.endsWith('/v3/replay/job_enhanced_123')) {
        assert.match(headers['smileid-token'] ?? '', /^eyJ/);
        return json(200, { status: 'success', message: 'replayed', job_id: 'job_enhanced_123', user_id: 'user_123' });
      }
      return json(404, { status: 'not_found', message: req.url });
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return `${header}.${payload}.signature`;
}
