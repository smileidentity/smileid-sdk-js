/**
 * The `product` claim each operation's token must carry, taken from the spec's
 * `x-smile-token-product` extension. An operation absent here requires a token
 * with no `product` claim.
 */
const PRODUCT_BY_PATH_TEMPLATE: Record<string, string> = {
  '/v3/basic_kyc': 'basic_kyc',
  '/v3/basic_kyc/sync': 'basic_kyc',
  '/v3/enhanced_kyc': 'enhanced_kyc',
  '/v3/enhanced_kyc/sync': 'enhanced_kyc',
  '/v3/document_verification': 'document_verification',
  '/v3/enhanced_document_verification': 'enhanced_document_verification',
  '/v3/residency_document_verification': 'residency_document_verification',
  '/v3/biometric_kyc': 'biometric_kyc',
  '/v3/registration': 'smart_selfie_registration',
  '/v3/authentication': 'smart_selfie_authentication',
  '/v3/compare': 'smart_selfie_compare',
  '/v3/aml': 'one_time_aml',
  '/v3/aml/sync': 'one_time_aml',
  '/v3/aml/monitoring': 'aml',
  '/v3/aml/monitoring/{job_id}/news/{reference}': 'aml',
};

const MATCHERS: [RegExp, string][] = Object.entries(PRODUCT_BY_PATH_TEMPLATE).map(
  ([template, product]) => [
    new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
    product,
  ],
);

/** The token product for a request path with its placeholders already filled in. */
export function productForPath(path: string): string | undefined {
  return MATCHERS.find(([matcher]) => matcher.test(path))?.[1];
}
