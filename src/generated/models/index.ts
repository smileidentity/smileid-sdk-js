/**
 * Wire models and public types (spec §5, §6).
 *
 * Generator-owned later: these mirror the request/response shapes and enums.
 * The public API is camelCase; the wire is always snake_case. The camel↔snake
 * mapping happens in the operation functions (see ../operations), never here.
 */

import type { Readable } from 'node:stream';

/** Environment selector. Sandbox by default (spec §2.1). */
export type Environment = 'sandbox' | 'production';

/**
 * A binary input. Accepts a filesystem path, a byte buffer, a Blob, or a
 * readable stream. Wrap it to override the filename or content type on the wire.
 */
export type BinaryInput =
  | string
  | Buffer
  | Uint8Array
  | Blob
  | Readable
  | {
      data: string | Buffer | Uint8Array | Blob | Readable;
      filename?: string;
      contentType?: string;
    };

/** Per-request options (spec §4: the last argument to every method). */
export interface RequestOptions {
  /** Per-request total timeout in milliseconds. Overrides the client default. */
  timeout?: number;
  /** Callback URL override for this request. */
  callbackUrl?: string;
  /** An AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

/** Consent block, required on all seven entry endpoints (spec §5.1). */
export interface Consent {
  /** Must be true. */
  granted: true;
  /** ISO 8601 timestamp. */
  grantedAt: string;
  /** ISO 639-1 language code, uppercase (e.g. "EN"). */
  noticeLanguage: string;
  /** URL of the privacy notice shown to the user. */
  noticePrivacyPolicyUrl: string;
}

/** Personal details, required on all seven entry endpoints (spec §5.1). */
export interface UserDetails {
  givenNames: string;
  lastName: string;
  /** At least one of email / phoneNumber is required (validated client-side). */
  email?: string | null;
  /** E.164 phone number. At least one of email / phoneNumber is required. */
  phoneNumber?: string | null;
}

/** Free-form partner-supplied key/value pairs (spec §5.1). */
export type PartnerParams = Record<string, string>;

/** A single metadata entry (spec §5.1). */
export interface MetadataItem {
  name: string;
  value: string;
}

/** Fields shared by the entry endpoints that always carry consent + user details. */
interface EntryParamsBase {
  consent: Consent;
  userDetails: UserDetails;
  callbackUrl?: string;
  partnerParams?: PartnerParams;
  metadata?: MetadataItem[];
}

/** enhanced_kyc.verify (spec §6.1). */
export interface EnhancedKycParams extends EntryParamsBase {
  country: string;
  idType: string;
  idNumber: string;
  bankCode?: string;
  operator?: string;
  /** Sent as the User-ID header. */
  userId?: string;
}

/** documents.verify (spec §6.2). */
export interface DocumentVerificationParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
  document: BinaryInput;
  documentBack?: BinaryInput;
  country: string;
  /** Optional; auto-classified if omitted. */
  idType?: string;
  /** Sent as the User-ID header. */
  userId?: string;
}

/** documents.verifyEnhanced (spec §6.3). Same as §6.2 but idType is required. */
export interface EnhancedDocumentVerificationParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
  document: BinaryInput;
  documentBack?: BinaryInput;
  country: string;
  idType: string;
  /** Sent as the User-ID header. */
  userId?: string;
}

/** biometricKyc.verify (spec §6.4). */
export interface BiometricKycParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
  country: string;
  idType: string;
  idNumber: string;
  sandboxResult?: number;
  /** Sent as the User-ID header. */
  userId?: string;
}

/** biometric.enroll → POST /v3/registration (spec §6.5). */
export interface RegistrationParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
  allowNewEnroll?: boolean;
  sandboxResult?: number;
  /** Sent as the User-ID header. */
  userId?: string;
}

/** biometric.authenticate (spec §6.6). user_id goes in the BODY (required). */
export interface AuthenticationParams extends EntryParamsBase {
  /** Required; must match an enrollee. Serialized as a body field, not a header. */
  userId: string;
  /** Required unless useEnrolledImage is true. */
  selfieImage?: BinaryInput;
  /** Required unless useEnrolledImage is true. */
  livenessImages?: BinaryInput[];
  useEnrolledImage?: boolean;
  sandboxResult?: number;
}

/** Allowed values for compare's comparisonImageType. */
export type ComparisonImageType = 'DOCUMENT' | 'ID_PHOTO' | 'PORTRAIT';

/** biometric.compare (spec §6.7). user_id is an optional BODY field. */
export interface CompareParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  comparisonImage: BinaryInput;
  comparisonImageType: ComparisonImageType;
  livenessImages?: BinaryInput[];
  allowNewEnroll?: boolean;
  /** Optional; serialized as a body field. If set and it passes, enrolls the user. */
  userId?: string;
  sandboxResult?: number;
}

/** verifications.replay optional body (spec §6.10, corrected to multipart). */
export interface ReplayParams {
  callbackUrl?: string;
}

/** The nine allowed fraud reasons (spec §6.11). */
export type FraudReason =
  | 'FIRST_PARTY_FRAUD'
  | 'SECOND_PARTY_FRAUD'
  | 'THIRD_PARTY_FRAUD'
  | 'SYNTHETIC_IDENTITY'
  | 'ACCOUNT_TAKEOVER'
  | 'DOCUMENT_FORGERY'
  | 'IDENTITY_FARMING'
  | 'MULE_ACCOUNT'
  | 'OTHER';

/** users.reportFraud (spec §6.11). */
export interface ReportFraudParams {
  isFraud: boolean;
  /** Email of the reporter. */
  reportedBy: string;
  /** Required when isFraud is true. */
  reason?: FraudReason;
  /** Required when isFraud is false OR reason is OTHER. Max 500 chars. */
  notes?: string;
}

/** users.flagFraud convenience wrapper params (spec §4). */
export interface FlagFraudParams {
  reason: FraudReason;
  notes?: string;
  reportedBy: string;
}

/** users.clearFraud convenience wrapper params (spec §4). */
export interface ClearFraudParams {
  notes: string;
  reportedBy: string;
}

/** services.bankCodes query (spec §6.12). */
export interface BankCodesParams {
  country?: string;
}

/** services.supportedIdTypes query (spec §6.13). */
export interface SupportedIdTypesParams {
  country?: string;
}

/** services.supportedDocuments query (spec §6.14). */
export interface SupportedDocumentsParams {
  continent?: 'AFRICA' | 'ASIA' | 'EUROPE' | 'NORTH AMERICA' | 'OCEANIA' | 'SOUTH AMERICA';
  countryCode?: string;
  locale?: 'en-GB' | 'fr-FR' | 'ar-EG';
}

/** services.idStatus query (spec §6.15). */
export interface IdStatusParams {
  country: string;
  idType: string;
}

/** Options for verifications.waitUntilComplete (spec §6.9). */
export interface WaitOptions {
  /** Poll interval in milliseconds. Default 2000. */
  interval?: number;
  /** Overall timeout in milliseconds. Default 60000. */
  timeout?: number;
  /** When true (default), a not_found status keeps polling instead of returning. */
  treatNotFoundAsPending?: boolean;
  /** Timeout in milliseconds for each individual poll request. */
  requestTimeout?: number;
  /** Aborts both the polling loop and any in-flight status request. */
  signal?: AbortSignal;
}

/**
 * Response to the entry endpoints (HTTP 202) and to replay / report_fraud.
 *
 * The wire `status` casing differs by endpoint ("Accepted" vs "accepted");
 * {@link AcceptedResponse.isAccepted} normalizes it (spec §5.2).
 */
export class AcceptedResponse {
  readonly status: string;
  readonly message: string;
  readonly jobId: string | null;
  readonly userId: string | null;
  readonly createdAt: string | null;

  constructor(fields: {
    status: string;
    message: string;
    jobId?: string | null;
    userId?: string | null;
    createdAt?: string | null;
  }) {
    this.status = fields.status;
    this.message = fields.message;
    this.jobId = fields.jobId ?? null;
    this.userId = fields.userId ?? null;
    this.createdAt = fields.createdAt ?? null;
  }

  /** True when the normalized status is "accepted" (case-insensitive). */
  get isAccepted(): boolean {
    return this.status.toLowerCase() === 'accepted';
  }
}

/** Job status from GET /v3/status (spec §5.2, §6.8). */
export class JobStatus {
  readonly status: string;
  readonly jobId: string | null;
  readonly userId: string | null;
  readonly message: string | null;

  constructor(fields: {
    status: string;
    jobId?: string | null;
    userId?: string | null;
    message?: string | null;
  }) {
    this.status = fields.status;
    this.jobId = fields.jobId ?? null;
    this.userId = fields.userId ?? null;
    this.message = fields.message ?? null;
  }

  get isComplete(): boolean {
    return this.status === 'complete';
  }
  get isProcessing(): boolean {
    return this.status === 'processing';
  }
  get isNotFound(): boolean {
    return this.status === 'not_found';
  }
}

/** services.bankCodes response (spec §5.2). */
export interface BankCodesResponse {
  bankCodes: { code: string; country: string; name: string }[];
}

/** services.supportedIdTypes response (spec §5.2). */
export interface SupportedIdTypesResponse {
  idTypes: {
    bankCode?: string;
    country: string;
    label: string;
    regex: string;
    requiredFields: string[];
    type: string;
  }[];
}

/** services.supportedDocuments response (spec §5.2). */
export interface SupportedDocumentsResponse {
  validDocuments: {
    country: { code: string; name: string; continent: string };
    idTypes: { code: string; name: string; example: string[]; hasBack: boolean }[];
  }[];
}

/** services.idStatus response (spec §5.2, §6.15). */
export interface IdStatusResponse {
  lastChecked: string;
  lastCheckStatus: string;
  lastHourSuccessRate: string;
  lastKnownStatus: string;
  lastCheckSuccessRate: string;
}
