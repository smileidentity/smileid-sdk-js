import type { BiometricKycParams as GeneratedBiometricKycParams } from '../generated/models/index.js';

/** biometricKyc.verify (spec §6.4). */
export interface BiometricKycParams extends GeneratedBiometricKycParams {
  /**
   * Verify against the user's enrolled selfie. Requires userId. Granted through the
   * job's token, never sent in the job body.
   */
  useEnrolledImage?: boolean;
}
