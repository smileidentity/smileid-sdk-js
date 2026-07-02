import { test } from 'node:test';
import assert from 'node:assert/strict';

import { waitUntilComplete } from './poll.js';
import { TimeoutError } from '../errors/index.js';
import { JobStatus } from '../generated/models/index.js';
import { SmileID } from '../client/client.js';
import { jsonResponse, routerFetch } from '../testing/mock.js';

const noSleep = async (): Promise<void> => {};

// Matrix item 7: wait_until_complete.
test('polls until the job is complete', async () => {
  const states = ['processing', 'processing', 'complete'];
  let i = 0;
  const retrieve = async (): Promise<JobStatus> =>
    new JobStatus({ status: states[i++], jobId: 'job_1' });
  const result = await waitUntilComplete(retrieve, { interval: 1, timeout: 1000 }, noSleep);
  assert.equal(result.isComplete, true);
  assert.equal(i, 3);
});

test('raises TimeoutError once the deadline passes', async () => {
  const retrieve = async (): Promise<JobStatus> => new JobStatus({ status: 'processing' });
  await assert.rejects(
    () => waitUntilComplete(retrieve, { interval: 1, timeout: -1 }, noSleep),
    TimeoutError,
  );
});

test('treatNotFoundAsPending=false returns the not_found status', async () => {
  const retrieve = async (): Promise<JobStatus> => new JobStatus({ status: 'not_found' });
  const result = await waitUntilComplete(
    retrieve,
    { interval: 1, timeout: 1000, treatNotFoundAsPending: false },
    noSleep,
  );
  assert.equal(result.isNotFound, true);
});

// Matrix item 4: jobs.retrieve returns a not_found JobStatus on 404 (never raises).
test('verifications.retrieve returns a not_found JobStatus on HTTP 404', async () => {
  const { fetch } = routerFetch(() =>
    jsonResponse(404, {
      status: 'not_found',
      job_id: 'job_1',
      user_id: 'unknown',
      message: 'Verification not found',
    }),
  );
  const client = new SmileID({ partnerId: '1234', apiKey: 'k', fetch });
  const js = await client.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
  assert.equal(js.isNotFound, true);
  assert.equal(js.message, 'Verification not found');
});
