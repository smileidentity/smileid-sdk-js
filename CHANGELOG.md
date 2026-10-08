# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [12.2.0] - 2026-10-08

### Changed

- Each request mints its own token, bound to that request's `userId` and product, instead of reusing one cached token. A 401 is no longer retried with a refreshed token.

### Added

- `biometricKyc.verify({ useEnrolledImage: true, userId })` verifies against the user's enrolled selfie; the grant is bound into the job's token and the selfie and liveness images may be omitted.

### Removed

- `useEnrolledImage` from `biometric.authenticate`; selfie and liveness images are now always required.

## [12.1.0] - 2026-10-01

### Added

- Residency document verification: `documents.verifyResidency`. `idType` defaults to `PASSPORT`.

## [12.0.0] - 2026-08-20

First public release.

### Added

- Verification products: Enhanced KYC, Biometric KYC, Document Verification,
  Enhanced Document Verification, and SmartSelfie enrollment,
  authentication and comparison.
- Job status retrieval, including a `waitUntilComplete` helper that polls
  until a job finishes or a timeout is reached.
- Callback replay for completed jobs.
- Fraud reporting, with `flagFraud` and `clearFraud` wrappers.
- Bank codes, supported ID types, supported documents, and ID provider
  status lookups.
- Sandbox and production environments, with a `baseUrl` override for other
  hosts.
- A typed error hierarchy under `SmileIDError`, covering client-side
  validation and every HTTP failure mode.
- Internal token management: fetch, cache until expiry, refresh once on a
  401.
- Retry policy for idempotent operations, honouring `Retry-After`.

[unreleased]: https://github.com/smileidentity/smileid-sdk-js/compare/v12.2.0...HEAD
[12.2.0]: https://github.com/smileidentity/smileid-sdk-js/compare/v12.1.0...v12.2.0
[12.1.0]: https://github.com/smileidentity/smileid-sdk-js/compare/v12.0.0...v12.1.0
[12.0.0]: https://github.com/smileidentity/smileid-sdk-js/releases/tag/v12.0.0
