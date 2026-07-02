/**
 * Polling helper for verifications.waitUntilComplete (spec §6.9).
 *
 * Repeatedly calls the retrieve function until the job completes or the
 * deadline passes. Defaults (interval 2s, timeout 60s) are SDK choices.
 */

import { TimeoutError } from '../errors/index.js';
import type { JobStatus, WaitOptions } from '../generated/models/index.js';

/** Wait until a job reaches a terminal state, or raise {@link TimeoutError}. */
export async function waitUntilComplete(
  retrieve: () => Promise<JobStatus>,
  opts: WaitOptions = {},
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<JobStatus> {
  const interval = opts.interval ?? 2000;
  const timeout = opts.timeout ?? 60000;
  const treatNotFoundAsPending = opts.treatNotFoundAsPending ?? true;
  const deadline = Date.now() + timeout;

  for (;;) {
    const status = await retrieve();
    if (status.isComplete) return status;
    if (status.isNotFound && !treatNotFoundAsPending) return status;
    if (Date.now() >= deadline) {
      throw new TimeoutError({
        message: `Timed out after ${timeout}ms waiting for job to complete.`,
      });
    }
    opts.signal?.throwIfAborted();
    await sleep(interval);
  }
}
