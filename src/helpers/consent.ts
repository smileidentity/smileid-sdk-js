/**
 * Consent builder (spec §5.1, §8).
 *
 * `Consent.granted(...)` sets `granted: true` and normalizes the timestamp to
 * an ISO 8601 string with milliseconds.
 */

import type { Consent as ConsentShape } from '../generated/models/index.js';

/** Arguments to {@link Consent.granted}. */
export interface ConsentGrantedArgs {
  /** A Date or an ISO 8601 string. */
  grantedAt: Date | string;
  /** ISO 639-1 language code, uppercase (e.g. "EN"). */
  noticeLanguage: string;
  noticePrivacyPolicyUrl: string;
}

/** Namespace object exposing the `granted` builder. */
export const Consent = {
  /** Build a granted consent block (`granted: true`). */
  granted(args: ConsentGrantedArgs): ConsentShape {
    const grantedAt =
      args.grantedAt instanceof Date ? args.grantedAt.toISOString() : args.grantedAt;
    return {
      granted: true,
      grantedAt,
      noticeLanguage: args.noticeLanguage,
      noticePrivacyPolicyUrl: args.noticePrivacyPolicyUrl,
    };
  },
};
