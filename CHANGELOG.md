# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- `baseUrl` must be an absolute https URL with no query string or fragment,
  validated at construction. No insecure override exists.
- `defaultCallbackUrl` and per-request `callbackUrl` values must be https;
  a non-https callback raises `ValidationError` before any request is sent.
- Multipart filenames and content types are sanitized against header
  injection on every path, including caller-supplied explicit content types.
- `job_id` / `user_id` path parameters are URL-encoded as single path
  segments.

### Removed

- The `partnerSecret` option and HMAC request signing
  (`SmileID-Timestamp` / `SmileID-Request-Signature` headers). Request
  signing may be reintroduced if a signing contract is agreed with the
  backend.

### Changed

- Renamed the package from `@smileid/core` to `@smileid/smileid`.
- Set the version to 12.0.0, aligning the server SDKs with the V12
  mobile SDKs.
- `environment` is validated at runtime: anything other than `sandbox` or
  `production` is rejected at construction.
- A 2xx response whose body is not a JSON object now raises the new
  `UnexpectedResponseError`.

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
