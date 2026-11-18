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

/**
 * documents.verifyResidency → POST /v3/residency_document_verification.
 * Same as §6.3 plus the visa endorsed in the passport; idType must be PASSPORT.
 */
export interface ResidencyDocumentVerificationParams extends EntryParamsBase {
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
  document: BinaryInput;
  documentBack?: BinaryInput;
  /** The visa page itself (JPEG or PNG), not the passport's biographical page. */
  visa: BinaryInput;
  country: string;
  /** Optional; defaults to PASSPORT, the only value the API accepts. */
  idType?: 'PASSPORT';
  /** Sent as the User-ID header. */
  userId?: string;
}

/** biometricKyc.verify (spec §6.4). */
export interface BiometricKycParams extends EntryParamsBase {
  /** Required unless the enrolled-image grant is used. */
  selfieImage?: BinaryInput;
  /** Required unless the enrolled-image grant is used. */
  livenessImages?: BinaryInput[];
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
  selfieImage: BinaryInput;
  livenessImages: BinaryInput[];
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

/** Fields shared by the One-Time AML and AML Monitoring screening requests. */
interface AmlParamsBase extends EntryParamsBase {
  /** ISO 3166-1 alpha-2 country codes (uppercase) to screen against. At least one. */
  countries: string[];
  /** Four-digit birth year used to narrow the screening. */
  birthYear?: string;
  /** When true (the API default) a higher match threshold is used. */
  strictMatch?: boolean;
  /** Alternate names to screen alongside the full name. At most 20. */
  aliases?: string[];
  /** Reuse the name of the user's prior KYC enrollment. Requires userId. */
  searchExistingUser?: boolean;
  /** Sent as a body field. Required when searchExistingUser is true. */
  userId?: string;
}

/** aml.screen → POST /v3/aml. */
export interface OneTimeAmlParams extends AmlParamsBase {
  fullName: string;
}

/** aml.screenSync → POST /v3/aml/sync. The callback URL is optional: none is sent. */
export interface OneTimeAmlSyncParams extends OneTimeAmlParams {
  /**
   * Makes a repeated submission safe: a key you already used resolves to the same job and
   * returns its original result. 16 to 128 characters of A-Z a-z 0-9 - _.
   */
  idempotencyKey?: string;
}

/** aml.monitor → POST /v3/aml/monitoring. */
export interface AmlMonitoringParams extends AmlParamsBase {
  /** Required unless searchExistingUser is true. */
  fullName?: string;
}

/** News categories accepted by aml.monitoringNews. */
export type AmlNewsCategory =
  | 'arms_trafficking'
  | 'credit_update'
  | 'environmental_crime'
  | 'financial_crime'
  | 'human_rights_violation'
  | 'leadership_change'
  | 'legal_risk'
  | 'location_change'
  | 'narcotics'
  | 'other'
  | 'other_crime'
  | 'ownership_change'
  | 'product_change'
  | 'regulatory'
  | 'sexual_crime'
  | 'technology_event'
  | 'terrorism'
  | 'violent_crime';

/** aml.monitoringNews query (GET /v3/aml/monitoring/{job_id}/news/{reference}). */
export interface AmlMonitoringNewsParams {
  newsCategory: AmlNewsCategory;
  /** Results page, 1 to 100. The API default is 1. */
  page?: number;
  /** Items per page, 1 to 100. The API default is 25. */
  limit?: number;
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

/**
 * Job status from GET /v3/status (spec §5.2, §6.8).
 *
 * `status` is `processing` while the job runs, `not_found` for an unknown job,
 * and otherwise the terminal decision itself: `clear`, `block`, `attention` or
 * `error`. `message` carries a human-readable note ("Job completed" on a
 * finished job) and never the decision.
 */
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

  /**
   * True once the job has reached a terminal decision — any status that is
   * neither `processing` nor `not_found`. A blank or missing status is not a
   * decision, so a truncated response never stops the poller.
   */
  get isComplete(): boolean {
    return Boolean(this.status) && !this.isProcessing && !this.isNotFound;
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

/** aml.monitoringNews response. */
export interface AmlMonitoringNewsResponse {
  jobId: string;
  product: 'aml_monitoring_news';
  userId: string;
  meta: { currentPage: number; limit: number; totalCount: number };
  news: {
    body: string;
    publishedDate: string;
    publisher: string;
    publisherCountryCode: string;
    title: string;
    url: string;
  }[];
}

/**
 * A sanctions, PEP or adverse-media hit. The fields are kept exactly as the API
 * sends them (snake_case), because the API may add provider fields at any time.
 */
export type AmlPersonMatch = Record<string, unknown>;

/**
 * The terminal result of a One-Time AML screening: the body of aml.screenSync and
 * the payload the async callback delivers. `partnerParams`, `consent`, `antifraud`,
 * `deviceSignals` and `people` hold free-form data and keep their wire keys.
 */
export interface OneTimeAmlResult {
  status: 'clear' | 'block' | 'attention' | 'error';
  message: string;
  reason: 'aml_match_found' | 'news_media_match' | 'service_unavailable' | 'high_risk' | null;
  createdAt: string;
  completedAt?: string;
  product: 'one_time_aml';
  partnerParams: Record<string, string> | null;
  kycReceipt: string | null;
  strictMatch: boolean;
  noOfPersonsFound: number;
  people: AmlPersonMatch[];
  userProvidedInfo: {
    givenNames: string | null;
    lastName: string | null;
    email: string | null;
    phoneNumber: string | null;
  };
  consent: Record<string, unknown>;
  antifraud: Record<string, unknown> | null;
  deviceSignals: Record<string, unknown> | null;
}
