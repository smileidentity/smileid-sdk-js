# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Full V3 API surface: enhanced KYC, document verification (standard and
  enhanced), biometric KYC, biometric enrollment / authentication / compare,
  verification status with a polling helper, callback replay, fraud reporting
  with `flagFraud` / `clearFraud` wrappers, and the services lookups.
- Internal token management: fetch, cache until expiry, refresh once on 401.
- Typed error hierarchy under `SmileIDError`.
- Retry policy for idempotent operations with `Retry-After` support.
- `Consent.granted` builder and client-side request validation.
- Always-on SDK telemetry headers.
- Optional HMAC request signing, off unless `partnerSecret` is set.
