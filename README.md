# @smileid/core

![npm version](https://img.shields.io/badge/npm-unpublished-lightgrey)
![CI status](https://img.shields.io/badge/CI-pending-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue)

Official Smile ID server-side SDK for JavaScript/TypeScript — V3 APIs.

This project is under active development and is not yet published to npm. The package name and API surface may change before the first release.

## Requirements

Node.js 18 or later. The SDK uses the built-in global `fetch` and has no runtime dependencies.

## Install

```sh
npm install @smileid/core
```

## Create a client

Construct a client with your partner id and API key. The SDK handles authentication for you: it fetches an internal token, caches it until just before expiry, and refreshes it once on a 401. You never handle tokens yourself.

```ts
import { SmileID } from '@smileid/core';

const smile = new SmileID({
  partnerId: '1234',
  apiKey: process.env.SMILE_API_KEY!,
  environment: 'sandbox', // the default
  defaultCallbackUrl: 'https://app.example.com/smile/callback',
});
```

### Environments

The client targets the sandbox by default. Set `environment: 'production'` to go live, or pass an explicit `baseUrl` to override both.

| Environment  | Base URL                            |
| ------------ | ----------------------------------- |
| `sandbox`    | `https://testapi.smileidentity.com` |
| `production` | `https://api.smileidentity.com`     |

### Other options

| Option               | Default    | Purpose                                                       |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `partnerSecret`      | unset      | Enables HMAC request signing when set (see below)             |
| `defaultCallbackUrl` | unset      | Used when a call omits `callbackUrl`                          |
| `baseUrl`            | derived    | Explicit override; wins over `environment`                    |
| `timeout`            | 30000 ms   | Per-request total timeout                                     |
| `maxRetries`         | 2          | Retries for idempotent operations only                        |
| `fetch`              | global     | Injectable fetch implementation for testing or proxies        |

## Shared inputs

Every verification call takes a `consent` block and `userDetails`. Build consent with the `Consent.granted` helper. `userDetails` needs at least one of `email` or `phoneNumber` — the SDK checks this before sending.

```ts
import { Consent } from '@smileid/core';

const consent = Consent.granted({
  grantedAt: new Date(),
  noticeLanguage: 'EN',
  noticePrivacyPolicyUrl: 'https://example.com/privacy',
});

const userDetails = { givenNames: 'John', lastName: 'Doe', email: 'john@example.com' };
```

Image inputs (`selfieImage`, `livenessImages`, `document`, `comparisonImage`) accept a file path, a `Buffer`, a `Blob`, or a readable stream. Wrap one in `{ data, filename, contentType }` to override the filename or content type.

Every method takes an optional final `options` argument with `timeout`, `callbackUrl`, and `signal` (an `AbortSignal`).

## Methods

### Enhanced KYC

```ts
const accepted = await smile.enhancedKyc.verify({
  country: 'NG',
  idType: 'NIN',
  idNumber: '12345678901',
  userDetails,
  consent,
  userId: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
});
accepted.jobId;      // "job_..."
accepted.isAccepted; // true
```

### Document verification

```ts
const accepted = await smile.documents.verify({
  country: 'NG',
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  document: './passport.jpg',
  userDetails,
  consent,
});
```

### Enhanced document verification

Same as document verification, but `idType` is required.

```ts
const accepted = await smile.documents.verifyEnhanced({
  country: 'NG',
  idType: 'PASSPORT',
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  document: './passport.jpg',
  userDetails,
  consent,
});
```

### Biometric KYC

```ts
const accepted = await smile.biometricKyc.verify({
  country: 'NG',
  idType: 'NIN',
  idNumber: '12345678901',
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  userDetails,
  consent,
});
```

### Biometric enrollment

```ts
const accepted = await smile.biometric.enroll({
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  userDetails,
  consent,
  userId: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
});
```

### Biometric authentication

`userId` is required and must match an enrolled user. Images are required unless `useEnrolledImage` is true.

```ts
const accepted = await smile.biometric.authenticate({
  userId: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  userDetails,
  consent,
});
```

### Selfie comparison

```ts
const accepted = await smile.biometric.compare({
  selfieImage: './selfie.jpg',
  comparisonImage: './id-photo.jpg',
  comparisonImageType: 'ID_PHOTO', // DOCUMENT | ID_PHOTO | PORTRAIT
  userDetails,
  consent,
});
```

### Check a verification

`retrieve` never throws on an unknown job: a 404 comes back as a `JobStatus` with `status: "not_found"` so polling can treat it as pending.

```ts
const status = await smile.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
status.isComplete;   // true when terminal
status.isProcessing; // true while running
status.message;      // e.g. "Verification completed with state: clear"
```

### Wait for completion

Polls until the job completes, then returns the final status. Throws `TimeoutError` when the deadline passes. Options: `interval` (default 2000 ms), `timeout` (default 60000 ms), and `treatNotFoundAsPending` (default true).

```ts
const status = await smile.verifications.waitUntilComplete('job_01h8x9y2z3a4b5c6d7e8f9g0h1', {
  interval: 2000,
  timeout: 60000,
});
```

### Replay a callback

Only completed verifications can be replayed; a replay of a job that is still processing throws `ConflictError`.

```ts
const accepted = await smile.verifications.replay('job_01h8x9y2z3a4b5c6d7e8f9g0h1', {
  callbackUrl: 'https://app.example.com/smile/callback',
});
```

### Report fraud

`reason` is required when flagging fraud; `notes` is required when clearing it or when the reason is `OTHER`.

```ts
const accepted = await smile.users.reportFraud('user_01h8x9y2z3a4b5c6d7e8f9g0h1', {
  isFraud: true,
  reason: 'ACCOUNT_TAKEOVER',
  reportedBy: 'trust@example.com',
});
```

The `flagFraud` and `clearFraud` wrappers set `isFraud` for you:

```ts
await smile.users.flagFraud('user_01h8x9y2z3a4b5c6d7e8f9g0h1', {
  reason: 'DOCUMENT_FORGERY',
  reportedBy: 'trust@example.com',
});

await smile.users.clearFraud('user_01h8x9y2z3a4b5c6d7e8f9g0h1', {
  notes: 'Investigated and cleared.',
  reportedBy: 'trust@example.com',
});
```

### Bank codes

No authentication needed.

```ts
const { bankCodes } = await smile.services.bankCodes({ country: 'NG' });
```

### Supported ID types

No authentication needed.

```ts
const { idTypes } = await smile.services.supportedIdTypes({ country: 'NG' });
```

### Supported documents

No authentication needed.

```ts
const { validDocuments } = await smile.services.supportedDocuments({ countryCode: 'NG' });
```

### ID provider status

```ts
const status = await smile.services.idStatus({ country: 'NG', idType: 'NIN' });
status.lastKnownStatus; // "online"
```

## Error handling

Every failure throws a subclass of `SmileIDError`. Each error carries `statusCode`, `status`, `message`, `code` (services errors only), `requestId`, and `rawBody`.

| Error                  | When                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `InvalidRequestError`  | 400 or 415                                                 |
| `ValidationError`      | Client-side validation, before any request is sent         |
| `AuthenticationError`  | 401 after one token refresh has already been tried         |
| `PaymentRequiredError` | 402, insufficient wallet balance                           |
| `PermissionError`      | 403                                                        |
| `NotFoundError`        | 404 (not thrown by `verifications.retrieve`)               |
| `ConflictError`        | 409, e.g. replaying a job that is still processing         |
| `PayloadTooLargeError` | 413                                                        |
| `RateLimitError`       | 429                                                        |
| `APIError`             | 5xx                                                        |
| `ConnectionError`      | Network failure with no HTTP response                      |
| `TimeoutError`         | `waitUntilComplete` deadline passed                        |

```ts
import { PaymentRequiredError, SmileIDError } from '@smileid/core';

try {
  await smile.enhancedKyc.verify({ /* ... */ });
} catch (err) {
  if (err instanceof PaymentRequiredError) {
    // top up the wallet
  } else if (err instanceof SmileIDError) {
    console.error(err.statusCode, err.message);
  }
}
```

### Retries

The SDK retries idempotent operations only (status and services reads, plus the internal token fetch) on connection errors, 408, 429, and 5xx, honouring the `Retry-After` header. It never retries verification submissions, replay, or fraud reports, and never retries a 409 — those are yours to decide.

## Telemetry

Every request carries three headers identifying the SDK: `SmileID-Source-SDK: node`, `SmileID-Source-SDK-Version`, and a `User-Agent` with the runtime version. These are observability metadata only; they are never used for authentication and carry no personal data.

## HMAC request signing

Signing is off by default. When you set `partnerSecret`, the SDK adds `SmileID-Timestamp` and `SmileID-Request-Signature` headers, signing the timestamp plus the exact request body bytes with HMAC-SHA256. The signature construction is provisional: confirm it with Smile ID before relying on it in production.

## License

MIT — see [LICENSE](LICENSE).
