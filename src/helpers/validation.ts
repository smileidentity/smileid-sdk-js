/**
 * Client-side validation performed before a request is sent (spec §5.1, §6.6, §6.11).
 *
 * These raise {@link ValidationError} (a subtype of InvalidRequestError) so a
 * bad call fails fast without a network round trip.
 */

import { ValidationError } from '../errors/index.js';
import type {
  AuthenticationParams,
  BiometricKycParams,
  CompareParams,
  Consent,
  DocumentVerificationParams,
  EnhancedDocumentVerificationParams,
  EnhancedKycParams,
  IdStatusParams,
  RegistrationParams,
  ReportFraudParams,
  UserDetails,
} from '../generated/models/index.js';

const COMPARISON_IMAGE_TYPES = new Set(['DOCUMENT', 'ID_PHOTO', 'PORTRAIT']);

function requiredString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError({ message: `${name} is required.` });
  }
}

/** user_details must carry at least one of email / phone_number (spec §5.1). */
export function validateUserDetails(userDetails: UserDetails): void {
  if (!userDetails || typeof userDetails !== 'object') {
    throw new ValidationError({ message: 'userDetails is required.' });
  }
  requiredString(userDetails.givenNames, 'userDetails.givenNames');
  requiredString(userDetails.lastName, 'userDetails.lastName');
  const hasEmail = typeof userDetails.email === 'string' && userDetails.email.length > 0;
  const hasPhone =
    typeof userDetails.phoneNumber === 'string' && userDetails.phoneNumber.length > 0;
  if (!hasEmail && !hasPhone) {
    throw new ValidationError({
      message: 'userDetails requires at least one of email or phoneNumber.',
    });
  }
}

export function validateConsent(consent: Consent): void {
  if (!consent || typeof consent !== 'object') {
    throw new ValidationError({ message: 'consent is required.' });
  }
  if (consent.granted !== true) {
    throw new ValidationError({ message: 'consent.granted must be true.' });
  }
  requiredString(consent.grantedAt, 'consent.grantedAt');
  requiredString(consent.noticeLanguage, 'consent.noticeLanguage');
  requiredString(consent.noticePrivacyPolicyUrl, 'consent.noticePrivacyPolicyUrl');
}

export function validateLivenessImages(images: unknown): void {
  if (!Array.isArray(images) || images.length < 6 || images.length > 8) {
    throw new ValidationError({ message: 'livenessImages must contain 6 to 8 images.' });
  }
  if (images.some((image) => image === undefined || image === null)) {
    throw new ValidationError({ message: 'livenessImages cannot contain empty images.' });
  }
}

function validateCommonEntry(params: { consent: Consent; userDetails: UserDetails }): void {
  validateConsent(params.consent);
  validateUserDetails(params.userDetails);
}

function validateBinary(value: unknown, name: string): void {
  if (value === undefined || value === null) {
    throw new ValidationError({ message: `${name} is required.` });
  }
}

export function validateEnhancedKyc(params: EnhancedKycParams): void {
  requiredString(params.country, 'country');
  requiredString(params.idType, 'idType');
  requiredString(params.idNumber, 'idNumber');
  validateCommonEntry(params);
}

export function validateDocumentVerification(params: DocumentVerificationParams): void {
  requiredString(params.country, 'country');
  validateBinary(params.selfieImage, 'selfieImage');
  validateBinary(params.document, 'document');
  validateLivenessImages(params.livenessImages);
  validateCommonEntry(params);
}

export function validateEnhancedDocumentVerification(
  params: EnhancedDocumentVerificationParams,
): void {
  validateDocumentVerification(params);
  requiredString(params.idType, 'idType');
}

export function validateBiometricKyc(params: BiometricKycParams): void {
  requiredString(params.country, 'country');
  requiredString(params.idType, 'idType');
  requiredString(params.idNumber, 'idNumber');
  validateBinary(params.selfieImage, 'selfieImage');
  validateLivenessImages(params.livenessImages);
  validateCommonEntry(params);
}

export function validateRegistration(params: RegistrationParams): void {
  validateBinary(params.selfieImage, 'selfieImage');
  validateLivenessImages(params.livenessImages);
  validateCommonEntry(params);
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
  requiredString(params.userId, 'userId');
  validateCommonEntry(params);
  if (params.useEnrolledImage === true) return;
  const hasSelfie = params.selfieImage !== undefined && params.selfieImage !== null;
  if (!hasSelfie || !Array.isArray(params.livenessImages)) {
    throw new ValidationError({
      message:
        'selfieImage and livenessImages are required unless useEnrolledImage is true.',
    });
  }
  validateLivenessImages(params.livenessImages);
}

export function validateCompare(params: CompareParams): void {
  validateBinary(params.selfieImage, 'selfieImage');
  validateBinary(params.comparisonImage, 'comparisonImage');
  if (!COMPARISON_IMAGE_TYPES.has(params.comparisonImageType)) {
    throw new ValidationError({
      message: 'comparisonImageType must be one of DOCUMENT, ID_PHOTO, or PORTRAIT.',
    });
  }
  if (params.livenessImages !== undefined) validateLivenessImages(params.livenessImages);
  validateCommonEntry(params);
}

export function validateIdStatus(params: IdStatusParams): void {
  requiredString(params.country, 'country');
  requiredString(params.idType, 'idType');
}
