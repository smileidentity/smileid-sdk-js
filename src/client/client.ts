/**
 * The SmileID client and its resource namespaces (spec §4).
 *
 * Canonical shape: `client.<resource>.<verb>(args, options)`. All 14 public
 * operations plus the waitUntilComplete poll helper and the flagFraud /
 * clearFraud convenience wrappers.
 */

import { resolveConfig, type SmileIDConfig } from './config.js';
import { Transport } from './transport.js';
import * as ops from '../generated/operations/index.js';
import { waitUntilComplete } from '../helpers/poll.js';
import {
  validateAuthentication,
  validateReportFraud,
  validateUserDetails,
} from '../helpers/validation.js';
import type {
  AcceptedResponse,
  AuthenticationParams,
  BankCodesParams,
  BankCodesResponse,
  BiometricKycParams,
  ClearFraudParams,
  CompareParams,
  DocumentVerificationParams,
  EnhancedDocumentVerificationParams,
  EnhancedKycParams,
  FlagFraudParams,
  IdStatusParams,
  IdStatusResponse,
  JobStatus,
  RegistrationParams,
  ReplayParams,
  ReportFraudParams,
  RequestOptions,
  SupportedDocumentsParams,
  SupportedDocumentsResponse,
  SupportedIdTypesParams,
  SupportedIdTypesResponse,
  WaitOptions,
} from '../generated/models/index.js';

/** The Smile ID V3 server-side client. */
export class SmileID {
  private readonly transport: Transport;

  /** enhanced_kyc (spec §6.1). */
  readonly enhancedKyc: {
    verify(params: EnhancedKycParams, options?: RequestOptions): Promise<AcceptedResponse>;
  };

  /** Document verification (spec §6.2, §6.3). */
  readonly documents: {
    verify(
      params: DocumentVerificationParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
    verifyEnhanced(
      params: EnhancedDocumentVerificationParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
  };

  /** Biometric KYC (spec §6.4). */
  readonly biometricKyc: {
    verify(params: BiometricKycParams, options?: RequestOptions): Promise<AcceptedResponse>;
  };

  /** Biometric enroll / authenticate / compare (spec §6.5–§6.7). */
  readonly biometric: {
    enroll(params: RegistrationParams, options?: RequestOptions): Promise<AcceptedResponse>;
    authenticate(
      params: AuthenticationParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
    compare(params: CompareParams, options?: RequestOptions): Promise<AcceptedResponse>;
  };

  /** Job status, polling, and callback replay (spec §6.8–§6.10). */
  readonly verifications: {
    retrieve(jobId: string, options?: RequestOptions): Promise<JobStatus>;
    waitUntilComplete(jobId: string, options?: WaitOptions): Promise<JobStatus>;
    replay(
      jobId: string,
      params?: ReplayParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
  };

  /** Fraud reporting (spec §6.11). */
  readonly users: {
    reportFraud(
      userId: string,
      params: ReportFraudParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
    flagFraud(
      userId: string,
      params: FlagFraudParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
    clearFraud(
      userId: string,
      params: ClearFraudParams,
      options?: RequestOptions,
    ): Promise<AcceptedResponse>;
  };

  /** Services lookups (spec §6.12–§6.15). */
  readonly services: {
    bankCodes(params?: BankCodesParams, options?: RequestOptions): Promise<BankCodesResponse>;
    supportedIdTypes(
      params?: SupportedIdTypesParams,
      options?: RequestOptions,
    ): Promise<SupportedIdTypesResponse>;
    supportedDocuments(
      params?: SupportedDocumentsParams,
      options?: RequestOptions,
    ): Promise<SupportedDocumentsResponse>;
    idStatus(params: IdStatusParams, options?: RequestOptions): Promise<IdStatusResponse>;
  };

  constructor(config: SmileIDConfig) {
    this.transport = new Transport(resolveConfig(config));
    const t = this.transport;

    this.enhancedKyc = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.enhancedKyc(t, params, options);
      },
    };

    this.documents = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.documentVerification(t, params, options);
      },
      verifyEnhanced: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.enhancedDocumentVerification(t, params, options);
      },
    };

    this.biometricKyc = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.biometricKyc(t, params, options);
      },
    };

    this.biometric = {
      enroll: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.registration(t, params, options);
      },
      authenticate: (params, options) => {
        validateUserDetails(params.userDetails);
        validateAuthentication(params);
        return ops.authentication(t, params, options);
      },
      compare: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.compare(t, params, options);
      },
    };

    this.verifications = {
      retrieve: (jobId, options) => ops.verificationStatus(t, jobId, options),
      waitUntilComplete: (jobId, options) =>
        waitUntilComplete(() => ops.verificationStatus(t, jobId), options),
      replay: (jobId, params, options) => ops.replayCallback(t, jobId, params, options),
    };

    this.users = {
      reportFraud: (userId, params, options) => {
        validateReportFraud(params);
        return ops.reportFraud(t, userId, params, options);
      },
      flagFraud: (userId, params, options) => {
        const report: ReportFraudParams = {
          isFraud: true,
          reason: params.reason,
          notes: params.notes,
          reportedBy: params.reportedBy,
        };
        validateReportFraud(report);
        return ops.reportFraud(t, userId, report, options);
      },
      clearFraud: (userId, params, options) => {
        const report: ReportFraudParams = {
          isFraud: false,
          notes: params.notes,
          reportedBy: params.reportedBy,
        };
        validateReportFraud(report);
        return ops.reportFraud(t, userId, report, options);
      },
    };

    this.services = {
      bankCodes: (params, options) => ops.bankCodes(t, params, options),
      supportedIdTypes: (params, options) => ops.supportedIdTypes(t, params, options),
      supportedDocuments: (params, options) => ops.supportedDocuments(t, params, options),
      idStatus: (params, options) => ops.idStatus(t, params, options),
    };
  }
}
