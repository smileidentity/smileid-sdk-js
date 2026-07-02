import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AcceptedResponse, JobStatus } from './index.js';

// Matrix item 5: AcceptedResponse status normalization.
test('AcceptedResponse.isAccepted normalizes "Accepted"', () => {
  const r = new AcceptedResponse({ status: 'Accepted', message: 'ok', jobId: 'job_1' });
  assert.equal(r.isAccepted, true);
  assert.equal(r.jobId, 'job_1');
});

test('AcceptedResponse.isAccepted normalizes "accepted"', () => {
  const r = new AcceptedResponse({ status: 'accepted', message: 'ok' });
  assert.equal(r.isAccepted, true);
});

test('AcceptedResponse.isAccepted is false for other statuses', () => {
  const r = new AcceptedResponse({ status: 'Rejected', message: 'no' });
  assert.equal(r.isAccepted, false);
});

test('JobStatus exposes terminal-state helpers', () => {
  assert.equal(new JobStatus({ status: 'complete' }).isComplete, true);
  assert.equal(new JobStatus({ status: 'processing' }).isProcessing, true);
  assert.equal(new JobStatus({ status: 'not_found' }).isNotFound, true);
});
