/**
 * @smileid/smileid — the official Smile ID server-side SDK for JavaScript/TypeScript.
 *
 * ```ts
 * import { SmileID, Consent } from '@smileid/smileid';
 * ```
 */

export { VERSION } from './version.js';

// Client + configuration.
export { SmileID } from './client/client.js';
export type { SmileIDConfig, FetchLike } from './client/config.js';

// Builders.
export { Consent } from './helpers/consent.js';
export type { ConsentGrantedArgs } from './helpers/consent.js';

// Response models.
export { AcceptedResponse, JobStatus } from './generated/models/index.js';

// Request/response types and enums.
export type {
  Environment,
  BinaryInput,
  RequestOptions,
  WaitOptions,
  Consent as ConsentType,
  UserDetails,
  PartnerParams,
  MetadataItem,
  EnhancedKycParams,
  DocumentVerificationParams,
  EnhancedDocumentVerificationParams,
  BiometricKycParams,
  RegistrationParams,
  AuthenticationParams,
  CompareParams,
  ComparisonImageType,
  ReplayParams,
  FraudReason,
  ReportFraudParams,
  FlagFraudParams,
  ClearFraudParams,
  BankCodesParams,
  BankCodesResponse,
  SupportedIdTypesParams,
  SupportedIdTypesResponse,
  SupportedDocumentsParams,
  SupportedDocumentsResponse,
  IdStatusParams,
  IdStatusResponse,
} from './generated/models/index.js';

// Error hierarchy.
export {
  SmileIDError,
  InvalidRequestError,
  AuthenticationError,
  PaymentRequiredError,
  PermissionError,
  NotFoundError,
  ConflictError,
  PayloadTooLargeError,
  RateLimitError,
  APIError,
  ConnectionError,
  TimeoutError,
  ValidationError,
} from './errors/index.js';
export type { SmileIDErrorFields } from './errors/index.js';
