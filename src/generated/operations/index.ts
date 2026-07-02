/**
 * Thin per-operation functions (spec §3, §6).
 *
 * Generator-owned later: each function takes typed camelCase params, maps them
 * to the verbatim snake_case wire (headers / query / path / multipart / JSON),
 * calls the transport, and maps the response back to a public model. All wire
 * field names are snake_case; the mapping boundary lives here.
 */

import { resolveBinary } from '../../helpers/binary.js';
import { buildMultipart, type MultipartPart } from '../../helpers/multipart.js';
import { camelizeKeys } from '../../helpers/case.js';
import type { RequestPlan, Transport } from '../../client/transport.js';
import {
  AcceptedResponse,
  JobStatus,
  type AuthenticationParams,
  type BankCodesParams,
  type BankCodesResponse,
  type BiometricKycParams,
  type CompareParams,
  type Consent,
  type DocumentVerificationParams,
  type EnhancedDocumentVerificationParams,
  type EnhancedKycParams,
  type IdStatusParams,
  type IdStatusResponse,
  type MetadataItem,
  type PartnerParams,
  type RegistrationParams,
  type ReportFraudParams,
  type RequestOptions,
  type SupportedDocumentsParams,
  type SupportedDocumentsResponse,
  type SupportedIdTypesParams,
  type SupportedIdTypesResponse,
  type UserDetails,
} from '../models/index.js';

// ---- shared serialization helpers -----------------------------------------

function consentJson(c: Consent): string {
  return JSON.stringify({
    granted: c.granted,
    granted_at: c.grantedAt,
    notice_language: c.noticeLanguage,
    notice_privacy_policy_url: c.noticePrivacyPolicyUrl,
  });
}

function userDetailsJson(u: UserDetails): string {
  const obj: Record<string, unknown> = {
    given_names: u.givenNames,
    last_name: u.lastName,
  };
  if (u.email !== undefined && u.email !== null) obj.email = u.email;
  if (u.phoneNumber !== undefined && u.phoneNumber !== null) obj.phone_number = u.phoneNumber;
  return JSON.stringify(obj);
}

function scalar(name: string, value: string | number | boolean | undefined): MultipartPart[] {
  if (value === undefined) return [];
  const str = typeof value === 'boolean' ? String(value) : String(value);
  return [{ kind: 'scalar', name, value: str }];
}

function jsonPart(name: string, json: string | undefined): MultipartPart[] {
  return json === undefined ? [] : [{ kind: 'json', name, json }];
}

function optionalJson(
  name: string,
  value: PartnerParams | MetadataItem[] | undefined,
): MultipartPart[] {
  if (value === undefined) return [];
  return [{ kind: 'json', name, json: JSON.stringify(value) }];
}

async function binaryPart(
  name: string,
  input: NonNullable<Parameters<typeof resolveBinary>[0]>,
  defaultName: string,
  defaultType = 'image/jpeg',
): Promise<MultipartPart> {
  const resolved = await resolveBinary(input, defaultName, defaultType);
  return {
    kind: 'binary',
    name,
    filename: resolved.filename,
    contentType: resolved.contentType,
    bytes: resolved.bytes,
  };
}

async function livenessParts(
  images: NonNullable<Parameters<typeof resolveBinary>[0]>[],
): Promise<MultipartPart[]> {
  // Repeated parts, all named liveness_images — never CSV/indexed (spec §5.3).
  return Promise.all(
    images.map((img, i) => binaryPart('liveness_images', img, `liveness${i + 1}.jpg`)),
  );
}

function toAccepted(json: unknown): AcceptedResponse {
  const o = (json ?? {}) as Record<string, unknown>;
  return new AcceptedResponse({
    status: typeof o.status === 'string' ? o.status : '',
    message: typeof o.message === 'string' ? o.message : '',
    jobId: typeof o.job_id === 'string' ? o.job_id : null,
    userId: typeof o.user_id === 'string' ? o.user_id : null,
    createdAt: typeof o.created_at === 'string' ? o.created_at : null,
  });
}

function toJobStatus(json: unknown): JobStatus {
  const o = (json ?? {}) as Record<string, unknown>;
  return new JobStatus({
    status: typeof o.status === 'string' ? o.status : '',
    jobId: typeof o.job_id === 'string' ? o.job_id : null,
    userId: typeof o.user_id === 'string' ? o.user_id : null,
    message: typeof o.message === 'string' ? o.message : null,
  });
}

function effectiveCallback(
  paramCb: string | undefined,
  opts: RequestOptions | undefined,
  transport: Transport,
): string | undefined {
  return paramCb ?? opts?.callbackUrl ?? transport.defaultCallbackUrl ?? undefined;
}

function planExtras(opts?: RequestOptions): Pick<RequestPlan, 'timeout' | 'signal'> {
  return { timeout: opts?.timeout, signal: opts?.signal };
}

// ---- entry endpoints -------------------------------------------------------

export async function enhancedKyc(
  transport: Transport,
  params: EnhancedKycParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('country', params.country),
    ...scalar('id_type', params.idType),
    ...scalar('id_number', params.idNumber),
    ...scalar('bank_code', params.bankCode),
    ...scalar('operator', params.operator),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/enhanced_kyc',
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false,
    headers: { 'User-ID': params.userId },
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function documentVerification(
  transport: Transport,
  params: DocumentVerificationParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('country', params.country),
    ...scalar('id_type', params.idType),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg'),
    ...(await livenessParts(params.livenessImages)),
    await binaryPart('document', params.document, 'document.jpg'),
    ...(params.documentBack
      ? [await binaryPart('document_back', params.documentBack, 'document_back.jpg')]
      : []),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/document_verification',
    authenticated: true,
    needsPartnerIdHeader: true,
    idempotent: false,
    headers: { 'User-ID': params.userId },
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function enhancedDocumentVerification(
  transport: Transport,
  params: EnhancedDocumentVerificationParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('country', params.country),
    ...scalar('id_type', params.idType),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg'),
    ...(await livenessParts(params.livenessImages)),
    await binaryPart('document', params.document, 'document.jpg'),
    ...(params.documentBack
      ? [await binaryPart('document_back', params.documentBack, 'document_back.jpg')]
      : []),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/enhanced_document_verification',
    authenticated: true,
    needsPartnerIdHeader: true,
    idempotent: false,
    headers: { 'User-ID': params.userId },
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function biometricKyc(
  transport: Transport,
  params: BiometricKycParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('country', params.country),
    ...scalar('id_type', params.idType),
    ...scalar('id_number', params.idNumber),
    ...scalar('sandbox_result', params.sandboxResult),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg'),
    ...(await livenessParts(params.livenessImages)),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/biometric_kyc',
    authenticated: true,
    needsPartnerIdHeader: true,
    idempotent: false,
    headers: { 'User-ID': params.userId },
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function registration(
  transport: Transport,
  params: RegistrationParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('allow_new_enroll', params.allowNewEnroll),
    ...scalar('sandbox_result', params.sandboxResult),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg'),
    ...(await livenessParts(params.livenessImages)),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/registration',
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false,
    headers: { 'User-ID': params.userId },
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function authentication(
  transport: Transport,
  params: AuthenticationParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  // user_id is a body field here (required), not the User-ID header (spec §6.6).
  const parts: MultipartPart[] = [
    ...scalar('user_id', params.userId),
    ...scalar('use_enrolled_image', params.useEnrolledImage),
    ...scalar('sandbox_result', params.sandboxResult),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    ...(params.selfieImage
      ? [await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg')]
      : []),
    ...(params.livenessImages ? await livenessParts(params.livenessImages) : []),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/authentication',
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false,
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function compare(
  transport: Transport,
  params: CompareParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  // user_id is an optional body field here (spec §6.7).
  const parts: MultipartPart[] = [
    ...scalar('comparison_image_type', params.comparisonImageType),
    ...scalar('allow_new_enroll', params.allowNewEnroll),
    ...scalar('user_id', params.userId),
    ...scalar('sandbox_result', params.sandboxResult),
    ...scalar('callback_url', effectiveCallback(params.callbackUrl, opts, transport)),
    await binaryPart('selfie_image', params.selfieImage, 'selfie.jpg'),
    await binaryPart('comparison_image', params.comparisonImage, 'comparison.jpg'),
    ...(params.livenessImages ? await livenessParts(params.livenessImages) : []),
    ...jsonPart('user_details', userDetailsJson(params.userDetails)),
    ...jsonPart('consent', consentJson(params.consent)),
    ...optionalJson('partner_params', params.partnerParams),
    ...optionalJson('metadata', params.metadata),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: '/v3/compare',
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false,
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

// ---- status / replay / fraud ----------------------------------------------

export async function verificationStatus(
  transport: Transport,
  jobId: string,
  opts?: RequestOptions,
): Promise<JobStatus> {
  const result = await transport.execute({
    method: 'GET',
    path: `/v3/status/${encodeURIComponent(jobId)}`,
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: true,
    allow404: true, // 404 returns a JobStatus body (spec §6.8), never raises.
    ...planExtras(opts),
  });
  return toJobStatus(result.json);
}

export async function replayCallback(
  transport: Transport,
  jobId: string,
  params?: { callbackUrl?: string },
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const callbackUrl = effectiveCallback(params?.callbackUrl, opts, transport);
  const result = await transport.execute({
    method: 'POST',
    path: `/v3/replay/${encodeURIComponent(jobId)}`,
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false, // never auto-retried (spec §2.6, §6.10)
    json: callbackUrl ? { callback_url: callbackUrl } : {},
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

export async function reportFraud(
  transport: Transport,
  userId: string,
  params: ReportFraudParams,
  opts?: RequestOptions,
): Promise<AcceptedResponse> {
  const parts: MultipartPart[] = [
    ...scalar('is_fraud', params.isFraud),
    ...scalar('reported_by', params.reportedBy),
    ...scalar('reason', params.reason),
    ...scalar('notes', params.notes),
  ];
  const result = await transport.execute({
    method: 'POST',
    path: `/v3/users/${encodeURIComponent(userId)}/report_fraud`,
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: false, // never auto-retried (spec §2.6)
    multipart: buildMultipart(parts),
    ...planExtras(opts),
  });
  return toAccepted(result.json);
}

// ---- services --------------------------------------------------------------

export async function bankCodes(
  transport: Transport,
  params?: BankCodesParams,
  opts?: RequestOptions,
): Promise<BankCodesResponse> {
  const result = await transport.execute({
    method: 'GET',
    path: '/v3/services/bank_codes',
    authenticated: false,
    needsPartnerIdHeader: false,
    idempotent: true,
    query: { country: params?.country },
    ...planExtras(opts),
  });
  return camelizeKeys(result.json) as BankCodesResponse;
}

export async function supportedIdTypes(
  transport: Transport,
  params?: SupportedIdTypesParams,
  opts?: RequestOptions,
): Promise<SupportedIdTypesResponse> {
  const result = await transport.execute({
    method: 'GET',
    path: '/v3/services/supported_id_types',
    authenticated: false,
    needsPartnerIdHeader: false,
    idempotent: true,
    query: { country: params?.country },
    ...planExtras(opts),
  });
  return camelizeKeys(result.json) as SupportedIdTypesResponse;
}

export async function supportedDocuments(
  transport: Transport,
  params?: SupportedDocumentsParams,
  opts?: RequestOptions,
): Promise<SupportedDocumentsResponse> {
  const result = await transport.execute({
    method: 'GET',
    path: '/v3/services/supported_documents',
    authenticated: false,
    needsPartnerIdHeader: false,
    idempotent: true,
    query: {
      continent: params?.continent,
      country_code: params?.countryCode,
      locale: params?.locale,
    },
    ...planExtras(opts),
  });
  return camelizeKeys(result.json) as SupportedDocumentsResponse;
}

export async function idStatus(
  transport: Transport,
  params: IdStatusParams,
  opts?: RequestOptions,
): Promise<IdStatusResponse> {
  const result = await transport.execute({
    method: 'GET',
    path: '/v3/services/id_status',
    authenticated: true,
    needsPartnerIdHeader: false,
    idempotent: true,
    query: { country: params.country, id_type: params.idType },
    ...planExtras(opts),
  });
  return camelizeKeys(result.json) as IdStatusResponse;
}
