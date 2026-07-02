/**
 * Client-side validation performed before a request is sent (spec §5.1, §6.6, §6.11).
 *
 * These raise {@link ValidationError} (a subtype of InvalidRequestError) so a
 * bad call fails fast without a network round trip.
 */

import { ValidationError } from '../errors/index.js';
import type {
  AuthenticationParams,
  ReportFraudParams,
  UserDetails,
} from '../generated/models/index.js';

/** user_details must carry at least one of email / phone_number (spec §5.1). */
export function validateUserDetails(userDetails: UserDetails): void {
  const hasEmail = typeof userDetails.email === 'string' && userDetails.email.length > 0;
  const hasPhone =
    typeof userDetails.phoneNumber === 'string' && userDetails.phoneNumber.length > 0;
  if (!hasEmail && !hasPhone) {
    throw new ValidationError({
      message: 'userDetails requires at least one of email or phoneNumber.',
    });
  }
}

/**
 * report_fraud conditional rules (spec §6.11):
 * - reason is required when isFraud is true;
 * - notes is required when isFraud is false OR reason is OTHER.
 */
export function validateReportFraud(params: ReportFraudParams): void {
  const hasNotes = typeof params.notes === 'string' && params.notes.length > 0;
  if (params.isFraud && !params.reason) {
    throw new ValidationError({
      message: 'reason is required when isFraud is true.',
    });
  }
  if (!params.isFraud && !hasNotes) {
    throw new ValidationError({
      message: 'notes is required when isFraud is false.',
    });
  }
  if (params.reason === 'OTHER' && !hasNotes) {
    throw new ValidationError({
      message: 'notes is required when reason is OTHER.',
    });
  }
  if (typeof params.notes === 'string' && params.notes.length > 500) {
    throw new ValidationError({ message: 'notes must be at most 500 characters.' });
  }
}

/**
 * authentication image rule (spec §6.6): unless useEnrolledImage is true,
 * selfieImage and livenessImages are both required.
 */
export function validateAuthentication(params: AuthenticationParams): void {
  if (params.useEnrolledImage === true) return;
  const hasSelfie = params.selfieImage !== undefined && params.selfieImage !== null;
  const hasLiveness =
    Array.isArray(params.livenessImages) && params.livenessImages.length > 0;
  if (!hasSelfie || !hasLiveness) {
    throw new ValidationError({
      message:
        'selfieImage and livenessImages are required unless useEnrolledImage is true.',
    });
  }
}
