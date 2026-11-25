/**
 * The SmileID client and its resource namespaces (spec §4).
 *
 * Canonical shape: `client.<resource>.<verb>(args, options)`. All public
 * operations plus the waitUntilComplete poll helper and the flagFraud /
 * clearFraud convenience wrappers.
 */

import { resolveConfig, type SmileIDConfig } from './config.js';
import { Transport } from './transport.js';
import type { BiometricKycParams } from './params.js';
import * as ops from '../generated/operations/index.js';
import { ValidationError } from '../errors/index.js';
import { waitUntilComplete } from '../helpers/poll.js';
import {
  validateAml,
  validateAuthentication,
  validateBiometricKyc,
  validateReportFraud,
  validateUserDetails,
} from '../helpers/validation.js';
import type {
  AcceptedResponse,
  AddressVerificationParams,
  AmlMonitoringNewsParams,
  AmlMonitoringNewsResponse,
  AmlMonitoringParams,
  AuthenticationParams,
  BankCodesParams,
  BankCodesResponse,
  BasicKycParams,
  BasicKycResult,
  BasicKycSyncParams,
  ClearFraudParams,
  CompareParams,
  CreateSmileLinkParams,
  DocumentVerificationParams,
  EnhancedDocumentVerificationParams,
  ResidencyDocumentVerificationParams,
  EnhancedKycParams,
  EnhancedKycResult,
  EnhancedKycSyncParams,
  FlagFraudParams,
  IdStatusParams,
  IdStatusResponse,
  JobStatus,
  ListSmileLinksParams,
  OneTimeAmlParams,
  OneTimeAmlResult,
  OneTimeAmlSyncParams,
  PhoneVerificationParams,
  RegistrationParams,
  ReplayParams,
  ReportFraudParams,
  RequestOptions,
  SmileLink,
  SmileLinkCreated,
  SmileLinkListResponse,
  SupportedDocumentsParams,
  SupportedDocumentsResponse,
  SupportedIdTypesParams,
  SupportedIdTypesResponse,
  UpdateSmileLinkParams,
  WaitOptions,
} from '../generated/models/index.js';

/** The Smile ID V3 server-side client. */
export class SmileID {
  private readonly transport: Transport;

  /** enhanced_kyc (spec §6.1). */
  readonly enhancedKyc: {
    verify(params: EnhancedKycParams, options?: RequestOptions): Promise<AcceptedResponse>;
    verifySync(
      params: EnhancedKycSyncParams,
      options?: RequestOptions,
    ): Promise<EnhancedKycResult>;
  };

  /** Basic KYC: match verdicts per submitted field. */
  readonly basicKyc: {
    verify(params: BasicKycParams, options?: RequestOptions): Promise<AcceptedResponse>;
    verifySync(params: BasicKycSyncParams, options?: RequestOptions): Promise<BasicKycResult>;
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
    verifyResidency(
      params: ResidencyDocumentVerificationParams,
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

  /** One-Time AML screening and AML Monitoring. */
  readonly aml: {
    screen(params: OneTimeAmlParams, options?: RequestOptions): Promise<AcceptedResponse>;
    screenSync(params: OneTimeAmlSyncParams, options?: RequestOptions): Promise<OneTimeAmlResult>;
    monitor(params: AmlMonitoringParams, options?: RequestOptions): Promise<AcceptedResponse>;
    monitoringNews(
      jobId: string,
      reference: string,
      params: AmlMonitoringNewsParams,
      options?: RequestOptions,
    ): Promise<AmlMonitoringNewsResponse>;
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

  /** Phone number verification: who a mobile number is registered to. */
  readonly phone: {
    verify(params: PhoneVerificationParams, options?: RequestOptions): Promise<AcceptedResponse>;
  };

  /** Address verification against a country's address provider. */
  readonly address: {
    verify(params: AddressVerificationParams, options?: RequestOptions): Promise<AcceptedResponse>;
  };

  /** Smile Links: hosted verification links to hand to end users. */
  readonly smileLinks: {
    create(params: CreateSmileLinkParams, options?: RequestOptions): Promise<SmileLinkCreated>;
    list(params?: ListSmileLinksParams, options?: RequestOptions): Promise<SmileLinkListResponse>;
    retrieve(refId: string, options?: RequestOptions): Promise<SmileLink>;
    update(
      refId: string,
      params: UpdateSmileLinkParams,
      options?: RequestOptions,
    ): Promise<SmileLink>;
  };

  constructor(config: SmileIDConfig) {
    this.transport = new Transport(resolveConfig(config));
    const t = this.transport;

    this.enhancedKyc = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.enhancedKyc(t, params, options);
      },
      verifySync: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.enhancedKycSync(t, params, options);
      },
    };

    this.basicKyc = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.basicKyc(t, params, options);
      },
      verifySync: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.basicKycSync(t, params, options);
      },
    };

    this.documents = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.documentVerification(t, params, options);
      },
      verifyEnhanced: (params, options) => {
        validateUserDetails(params.userDetails);
        // idType is required for enhanced document verification (spec §6.3);
        // enforced at runtime for plain-JavaScript callers too.
        if (!params.idType) {
          throw new ValidationError({
            message: 'idType is required for enhanced document verification.',
          });
        }
        return ops.enhancedDocumentVerification(t, params, options);
      },
      verifyResidency: (params, options) => {
        validateUserDetails(params.userDetails);
        // idType defaults to PASSPORT, the only value the API accepts; it also requires the visa image; enforced at
        // runtime for plain-JavaScript callers too.
        if (params.idType !== undefined && params.idType !== 'PASSPORT') {
          throw new ValidationError({
            message: 'idType must be PASSPORT for residency document verification.',
          });
        }
        if (!params.visa) {
          throw new ValidationError({
            message: 'visa is required for residency document verification.',
          });
        }
        return ops.residencyDocumentVerification(t, params, options);
      },
    };

    this.biometricKyc = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        validateBiometricKyc(params);
        return ops.biometricKyc(
          params.useEnrolledImage === true ? t.withEnrolledImageGrant() : t,
          params,
          options,
        );
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

    this.aml = {
      screen: (params, options) => {
        validateAml(params);
        return ops.oneTimeAml(t, params, options);
      },
      screenSync: (params, options) => {
        validateAml(params);
        return ops.oneTimeAmlSync(t, params, options);
      },
      monitor: (params, options) => {
        validateAml(params);
        // fullName may only be left out when the name is resolved from the user's prior KYC.
        if (!params.fullName && params.searchExistingUser !== true) {
          throw new ValidationError({
            message: 'fullName is required unless searchExistingUser is true.',
          });
        }
        return ops.amlMonitoring(t, params, options);
      },
      monitoringNews: (jobId, reference, params, options) =>
        ops.amlMonitoringNews(t, jobId, reference, params, options),
    };

    this.verifications = {
      retrieve: (jobId, options) => ops.verificationStatus(t, jobId, options),
      waitUntilComplete: (jobId, options) =>
        waitUntilComplete(
          () =>
            ops.verificationStatus(t, jobId, {
              signal: options?.signal,
              timeout: options?.requestTimeout,
            }),
          options,
        ),
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

    this.phone = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.phoneVerification(t, params, options);
      },
    };

    this.address = {
      verify: (params, options) => {
        validateUserDetails(params.userDetails);
        return ops.addressVerification(t, params, options);
      },
    };

    this.smileLinks = {
      create: (params, options) => ops.createSmileLink(t, params, options),
      list: (params, options) => ops.listSmileLinks(t, params, options),
      retrieve: (refId, options) => ops.getSmileLink(t, refId, options),
      update: (refId, params, options) => {
        if (params.idTypes === undefined && params.isDisabled === undefined) {
          throw new ValidationError({
            message: 'update requires at least one of idTypes or isDisabled.',
          });
        }
        return ops.updateSmileLink(t, refId, params, options);
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
