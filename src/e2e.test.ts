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
 *
 * Set SMILE_BASE_URL to point the run at another Smile ID host; without it the
 * test targets the sandbox.
 */

const partnerId = process.env.SMILE_PARTNER_ID;
const apiKey = process.env.SMILE_API_KEY;
const baseUrl = process.env.SMILE_BASE_URL;
const hasCreds = Boolean(partnerId && apiKey);

test(
  'sandbox Enhanced KYC submission then wait_until_complete',
  { skip: hasCreds ? false : 'SMILE_PARTNER_ID / SMILE_API_KEY not set' },
  async () => {
    const client = new SmileID({
      partnerId: partnerId as string,
      apiKey: apiKey as string,
      environment: 'sandbox',
      ...(baseUrl ? { baseUrl } : {}),
    });

    // Non-production environments only accept recognized test identities,
    // matched on given_names + last_name + email. An identity that is not
    // recognized resolves to `block`.
    const accepted = await client.enhancedKyc.verify({
      country: 'NG',
      idType: 'NIN',
      idNumber: '12345678901',
      userDetails: {
        givenNames: 'Amina Fatou',
        lastName: 'Clearwater',
        email: 'amina.clearwater@example.com',
      },
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
    assert.equal(status.isComplete, true);
    assert.equal(status.status, 'clear');
  },
);
