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

/**
 * enhancedKyc.verifySync → POST /v3/enhanced_kyc/sync. The endpoint ignores `callback_url`, so
 * the client's default callback URL is never sent; one is sent only if you set it on this call.
 */
export type EnhancedKycSyncParams = EnhancedKycParams;

/**
 * The terminal result of an Enhanced KYC verification: the body of enhancedKyc.verifySync,
 * which is the same payload the async callback delivers. The spec documents only a few of
 * its fields, so those are typed here and the whole body is kept in `body` with its wire keys.
 */
export interface EnhancedKycResult {
  /**
   * The Smile job id, from the response's `SmileID-Job-ID` header, or from the body's
   * `job_id` when the response had no header. Null when neither is present.
   */
  jobId: string | null;
  /** From the response's `User-ID` header, or from the body's `user_id`. Null when neither is present. */
  userId: string | null;
  /** The decision: `clear`, `attention`, `block` or `error`. */
  status: string;
  message: string;
  reason: string | null;
  kycReceipt: string | null;
  /**
   * The `Response-Signature` header, or null when absent. It is computed the same way as a
   * webhook signature, so your webhook verification code can check it. The SDK does not.
   */
  responseSignature: string | null;
  /** The `Response-Timestamp` header the signature was computed against, or null when absent. */
  responseTimestamp: string | null;
  /** The response body exactly as the API sent it (snake_case keys), including untyped fields. */
  body: Record<string, unknown>;
}

/** basicKyc.verify → POST /v3/basic_kyc. Takes the same fields as enhancedKyc.verify. */
export interface BasicKycParams extends EntryParamsBase {
  country: string;
  idType: string;
  idNumber: string;
  bankCode?: string;
  operator?: string;
}

/**
 * basicKyc.verifySync → POST /v3/basic_kyc/sync. The endpoint ignores `callback_url`, so the
 * client's default callback URL is never sent; one is sent only if you set it on this call.
 */
export type BasicKycSyncParams = BasicKycParams;

/** How one submitted field compared with the ID authority's record. */
export type MatchVerdict =
  | 'exact_match'
  | 'partial_match'
  | 'transposed'
  | 'no_match'
  | 'not_provided';

/** The verdict per submitted field of a Basic KYC result. There is none for the id number. */
export interface BasicKycMatchResults {
  overall: MatchVerdict;
  names: MatchVerdict;
  firstName: MatchVerdict;
  lastName: MatchVerdict;
  otherNames: MatchVerdict;
  dateOfBirth: MatchVerdict;
  gender: MatchVerdict;
  phoneNumber: MatchVerdict;
  secondaryIdNumber: MatchVerdict;
}

/**
 * The terminal result of a Basic KYC verification: the body of basicKyc.verifySync and
 * the payload the async callback delivers. `partnerParams`, `consent`, `antifraud` and
 * `deviceSignals` hold free-form data and keep their wire keys.
 */
export interface BasicKycResult {
  status: 'clear' | 'attention' | 'block' | 'error';
  message: string;
  reason: string | null;
  createdAt: string;
  completedAt?: string;
  product: 'basic_kyc';
  partnerParams?: Record<string, unknown> | null;
  /** Null when the check never produced a verdict. */
  matchResults: BasicKycMatchResults | null;
  userProvidedInfo: {
    givenNames?: string | null;
    lastName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
    idNumber?: string | null;
  };
  consent: Record<string, unknown>;
  antifraud?: Record<string, unknown> | null;
  deviceSignals?: Record<string, unknown> | null;
  kycReceipt?: string | null;
  /**
   * The Smile job id, from the response's `SmileID-Job-ID` header, or null when
   * the response had none. Optional so objects typed before this field existed
   * still compile; the SDK always sets it.
   */
  jobId?: string | null;
  /**
   * From the response's `User-ID` header, or the body's `user_id` when the header is absent.
   * Null when neither is present. Optional so older typed objects still compile; the SDK always sets it.
   */
  userId?: string | null;
  /**
   * The `Response-Signature` header, or null when absent. It is computed the same way as a
   * webhook signature, so your webhook verification code can check it. The SDK does not.
   */
  responseSignature?: string | null;
  /** The `Response-Timestamp` header the signature was computed against, or null when absent. */
  responseTimestamp?: string | null;
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

/** phone.verify → POST /v3/phone. Checks who a mobile number is registered to. */
export interface PhoneVerificationParams extends EntryParamsBase {
  /** ISO 3166-1 alpha-2 code of the country the number belongs to. */
  country: string;
  /** The number to verify, in E.164 format. It is not `userDetails.phoneNumber`. */
  phoneNumber: string;
  /** Mobile network operator: `MTN`, `VODAFONE` or `AIRTELTIGO`. Required for Ghana. */
  operator?: 'MTN' | 'VODAFONE' | 'AIRTELTIGO';
  /** National ID number to match against the registration. Required for Kenya. */
  idNumber?: string;
  /** Your own user id, sent as a body field. The API mints one when you omit it. */
  userId?: string;
}

/**
 * address.verify → POST /v3/address. Send `idNumber` (required for South Africa) or
 * `utilityNumber` with `utilityProvider` and `utilityType` (required for Nigeria).
 */
export interface AddressVerificationParams extends EntryParamsBase {
  /** The address to verify, as the user gave it to you. */
  address: string;
  /** `NG` or `ZA`. */
  country: 'NG' | 'ZA';
  /** The national ID number the address is registered against. */
  idNumber?: string;
  /** The utility meter or account number the address is registered against. */
  utilityNumber?: string;
  /** Code of the Nigerian utility provider. */
  utilityProvider?: string;
  /** Whether the Nigerian utility account is prepaid or postpaid. */
  utilityType?: 'PrePaid' | 'PostPaid';
  /** Your own user id, sent as a body field. The API mints one when you omit it. */
  userId?: string;
}

/** One verification a Smile Link offers. */
export interface SmileLinkIdType {
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  idType: string;
  /**
   * `biometric_kyc`, `document_verification`, `enhanced_document_verification` or
   * `enhanced_kyc`. A link read back names Document Verification `doc_verification`.
   */
  verificationMethod: string;
}

/** smileLinks.create → POST /v3/smile_links. */
export interface CreateSmileLinkParams {
  /** At least one. */
  idTypes: SmileLinkIdType[];
  name: string;
  /** Must be a public HTTPS URL. */
  noticePrivacyPolicyUrl: string;
  isSingleUse: boolean;
  /** Omit it to show the company's own name. It cannot be changed after the link is created. */
  companyName?: string;
  /** A public HTTPS URL. Defaults to the client's `defaultCallbackUrl`, or else the partner's configured callback. */
  callbackUrl?: string;
  description?: string;
  /** ISO 8601 timestamp. Defaults to 90 days from creation for single-use links. */
  expiresAt?: string;
  logoUrl?: string;
  redirectUrl?: string;
  themeColor?: string;
  partnerParams?: PartnerParams;
  /** The user id for a single-use link's job. */
  userId?: string;
}

/** The acknowledgment smileLinks.create returns. */
export interface SmileLinkCreated {
  /** The URL to hand to the end user. */
  link: string;
  message: string;
  /** The link's id, used by the other `smileLinks` methods. */
  refId: string;
  /** Null on multi-use links. */
  userId: string | null;
}

/** A Smile Link resource. `partnerParams` keeps the keys you sent. */
export interface SmileLink {
  refId: string;
  link: string;
  name: string;
  companyName?: string;
  description?: string | null;
  idTypes?: SmileLinkIdType[];
  isSingleUse?: boolean;
  callbackUrl?: string;
  noticePrivacyPolicyUrl?: string;
  logoUrl?: string;
  redirectUrl?: string | null;
  themeColor?: string;
  expiresAt?: string | null;
  /** Set while the link is disabled; null when active. */
  disabledAt?: string | null;
  partnerParams?: Record<string, unknown> | null;
  userId?: string | null;
  tokenProvidedFields?: string[];
  tokenProvidedValues?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  /** Any other field the API adds, camelCased. */
  [field: string]: unknown;
}

/** Outcome counts for the jobs run against a link. */
export interface SmileLinkJobStats {
  clear: number;
  block: number;
  attention: number;
  error: number;
  successfulJobs: number;
  failedJobs: number;
  totalJobs: number;
}

/** An entry in a smileLinks.list page: the link and its job stats. */
export type SmileLinkListItem = SmileLink & SmileLinkJobStats;

/** smileLinks.list query. */
export interface ListSmileLinksParams {
  /** Page size, 1 to 100. The API default is 20. */
  limit?: number;
  /** Page number, from 1. The API default is 1. */
  page?: number;
  /** `true` for single-use links only, `false` for reusable links only. Omit for both. */
  singleUse?: boolean;
}

/** One page of smileLinks.list. */
export interface SmileLinkListResponse {
  links: SmileLinkListItem[];
  meta: { currentPage: number; limit: number; totalCount: number; totalPages: number };
}

/** smileLinks.update body. Send at least one field. */
export interface UpdateSmileLinkParams {
  /** Replaces the link's `idTypes`. 1 to 50 entries. */
  idTypes?: SmileLinkIdType[];
  /** `true` disables the link, `false` re-enables it. */
  isDisabled?: boolean;
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
  /**
   * The Smile job id, from the response's `SmileID-Job-ID` header, or null when
   * the response had none. Optional so objects typed before this field existed
   * still compile; the SDK always sets it.
   */
  jobId?: string | null;
  /**
   * From the response's `User-ID` header, or the body's `user_id` when the header is absent.
   * Null when neither is present. Optional so older typed objects still compile; the SDK always sets it.
   */
  userId?: string | null;
  /**
   * The `Response-Signature` header, or null when absent. It is computed the same way as a
   * webhook signature, so your webhook verification code can check it. The SDK does not.
   */
  responseSignature?: string | null;
  /** The `Response-Timestamp` header the signature was computed against, or null when absent. */
  responseTimestamp?: string | null;
}
