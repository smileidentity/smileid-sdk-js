import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SmileID } from './client/client.js';
import { Consent } from './helpers/consent.js';

/**
 * End-to-end sandbox check (spec §11 gate item 5).
 *
 * Submits a sandbox Enhanced KYC job, then polls until it leaves the processing
 * state. It reads SMILE_PARTNER_ID and SMILE_API_KEY from the environment and
 * skips cleanly when either is unset. The credentials are never printed.
 */

const partnerId = process.env.SMILE_PARTNER_ID;
const apiKey = process.env.SMILE_API_KEY;
const hasCreds = Boolean(partnerId && apiKey);

test(
  'sandbox Enhanced KYC submission then wait_until_complete',
  { skip: hasCreds ? false : 'SMILE_PARTNER_ID / SMILE_API_KEY not set' },
  async () => {
    const client = new SmileID({
      partnerId: partnerId as string,
      apiKey: apiKey as string,
      environment: 'sandbox',
    });

    const accepted = await client.enhancedKyc.verify({
      country: 'NG',
      idType: 'NIN',
      idNumber: '00000000000',
      userDetails: { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' },
      consent: Consent.granted({
        grantedAt: new Date(),
        noticeLanguage: 'EN',
        noticePrivacyPolicyUrl: 'https://example.com/privacy',
      }),
    });

    assert.equal(accepted.isAccepted, true);
    assert.ok(accepted.jobId, 'a job_id was returned');

    const status = await client.verifications.waitUntilComplete(accepted.jobId as string, {
      interval: 2000,
      timeout: 60000,
    });
    assert.ok(['complete', 'processing'].includes(status.status));
  },
);
