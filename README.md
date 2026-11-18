# @smileid/usesmileid-nodejs

![npm version](https://img.shields.io/badge/npm-unpublished-lightgrey)
![CI status](https://img.shields.io/badge/CI-pending-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue)

Official Smile ID server-side SDK for JavaScript/TypeScript — V3 APIs.

This project is under active development and is not yet published to npm. The package name and API surface may change before the first release.

## Requirements

Node.js 18 or later. The SDK uses the built-in global `fetch` and has no runtime dependencies. Development and CI use the version pinned in `.nvmrc`.

## Install

```sh
npm install @smileid/usesmileid-nodejs
```

## Create a client

Construct a client with your partner id and API key. The SDK handles authentication for you: before each request it fetches a short-lived internal token. A verification job's token is bound to that job's product and, when the job names one, its user; other calls get a token with neither. You never handle tokens yourself.

```ts
import { SmileID } from '@smileid/usesmileid-nodejs';

const smile = new SmileID({
  partnerId: '1234',
  apiKey: process.env.SMILE_API_KEY!,
  environment: 'sandbox', // the default
  defaultCallbackUrl: 'https://app.example.com/smile/callback',
});
```

Partner ids are displayed zero-padded (for example 002) but must be passed without leading zeros (2).

### Environments and base URL

The client targets the sandbox by default. Set `environment: 'production'` to go live. Only `sandbox` and `production` are accepted; anything else is rejected at construction.

| Environment  | Base URL                            |
| ------------ | ----------------------------------- |
| `sandbox`    | `https://testapi.smileidentity.com` |
| `production` | `https://api.smileidentity.com`     |

Any other host needs an explicit `baseUrl`, which wins over `environment`:

```ts
const smile = new SmileID({
  partnerId: '2',
  apiKey: process.env.SMILE_API_KEY!,
  baseUrl: process.env.SMILE_BASE_URL ?? 'https://your-environment.example.com',
});
```

### HTTPS requirements

The SDK talks to Smile ID over HTTPS only:

- `baseUrl` must be an absolute `https://` URL with no query string or fragment. There is no option to allow plain HTTP.
- `defaultCallbackUrl` and every per-request `callbackUrl` must be `https://` URLs. A non-HTTPS callback raises `ValidationError` before any request is sent.

Both are checked at client construction; per-request callback URLs are checked again before each send.

### Other options

| Option               | Default    | Purpose                                                       |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `defaultCallbackUrl` | unset      | Used when a call omits `callbackUrl`                          |
| `timeout`            | 30000 ms   | Per-request total timeout                                     |
| `maxRetries`         | 2          | Retries for idempotent operations only                        |
| `fetch`              | global     | Injectable fetch implementation for testing or proxies        |

## Shared inputs

Every verification call takes a `consent` block and `userDetails`. Build consent with the `Consent.granted` helper. `userDetails` needs at least one of `email` or `phoneNumber` — the SDK checks this before sending.

```ts
import { Consent } from '@smileid/usesmileid-nodejs';

const consent = Consent.granted({
  grantedAt: new Date(),
  noticeLanguage: 'EN',
  noticePrivacyPolicyUrl: 'https://example.com/privacy',
});

const userDetails = {
  givenNames: 'Amina Fatou',
  lastName: 'Clearwater',
  email: 'amina.clearwater@example.com',
};
```

Non-production environments match test identities on given names, last name and email. An unrecognised identity resolves to `block`.

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

### Residency document verification

Verifies a passport and the visa endorsed in it. `idType` is optional and defaults to `PASSPORT`, the only value the API accepts. `visa` is the visa page itself. Results take longer than document verification, so rely on the callback rather than polling. The callback adds an `additional_documents` array with the visa details.

```ts
const accepted = await smile.documents.verifyResidency({
  country: 'NG',
  selfieImage: './selfie.jpg',
  livenessImages: ['./live1.jpg', './live2.jpg', './live3.jpg', './live4.jpg', './live5.jpg', './live6.jpg'],
  document: './passport.jpg',
  visa: './visa.jpg',
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

To verify against a user's enrolled selfie instead of a fresh capture, set `useEnrolledImage` and pass the enrolled `userId`; the selfie and liveness images may then be omitted.

```ts
const accepted = await smile.biometricKyc.verify({
  useEnrolledImage: true,
  userId: 'user_01h8x9y2z3a4b5c6d7e8f9g0h1',
  country: 'NG',
  idType: 'NIN',
  idNumber: '12345678901',
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

Authenticates a previously enrolled user against a fresh selfie and liveness capture. `userId` is required and must match an enrolled user.

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

### AML screening

`aml.screen` runs a One-Time AML screening of a name against sanctions, PEP and adverse-media lists. The result arrives on your callback URL. `countries` and `fullName` are required. `aliases` takes at most 20 names and `birthYear` a four-digit year. The SDK sends the array fields as JSON strings, as the API requires.

```ts
const accepted = await smile.aml.screen({
  countries: ['NG', 'KE'],
  fullName: 'John Doe',
  birthYear: '1990',
  userDetails,
  consent,
});
```

`aml.screenSync` runs the same screening and returns the result in the response, so you need no callback URL. Pass an `idempotencyKey` (16 to 128 characters of `A-Z a-z 0-9 - _`) so a repeat of the call returns the original result instead of starting a second, billed screening. The call is never retried automatically. `partnerParams`, `consent`, `antifraud`, `deviceSignals` and `people` in the result keep their wire (snake_case) keys.

```ts
const result = await smile.aml.screenSync({
  countries: ['NG'],
  fullName: 'John Doe',
  userDetails,
  consent,
  idempotencyKey: 'onboarding-8f14e45fceea167a',
});
console.log(result.status, result.noOfPersonsFound);
```

`aml.monitor` enrols the name for ongoing AML Monitoring. It takes the same fields as `aml.screen`, but `fullName` may be left out when `searchExistingUser` is `true`, which needs `userId`. `aml.monitoringNews` reads the news items behind one person reference in a monitoring result.

```ts
const accepted = await smile.aml.monitor({ countries: ['NG'], fullName: 'Jane Doe', userDetails, consent });

const news = await smile.aml.monitoringNews(accepted.jobId!, 'ref_001', {
  newsCategory: 'financial_crime',
  page: 1,
  limit: 25,
});
```

### Check a verification

`retrieve` never throws on an unknown job: a 404 comes back as a `JobStatus` with `status: "not_found"` so polling can treat it as pending.

`status` is `processing` while the job runs, `not_found` for an unknown job, and otherwise the decision itself: `clear`, `block`, `attention` or `error`. `message` is a human-readable note, "Job completed" on a finished job — the decision is never in the message.

```ts
const status = await smile.verifications.retrieve('job_01h8x9y2z3a4b5c6d7e8f9g0h1');
status.status;       // e.g. "clear"
status.isComplete;   // true on any decision, i.e. not processing and not not_found
status.isProcessing; // true while running
status.message;      // e.g. "Job completed"
```

### Wait for completion

Polls while the job is `processing` (and, by default, while it is `not_found`), then returns the status carrying the decision. Throws `TimeoutError` when the deadline passes. Options: `interval` (default 2000 ms), `timeout` (default 60000 ms), and `treatNotFoundAsPending` (default true).

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
| `AuthenticationError`  | 401                                                        |
| `PaymentRequiredError` | 402, insufficient wallet balance                           |
| `PermissionError`      | 403                                                        |
| `NotFoundError`        | 404 (not thrown by `verifications.retrieve`)               |
| `ConflictError`        | 409, e.g. replaying a job that is still processing         |
| `PayloadTooLargeError` | 413                                                        |
| `RateLimitError`       | 429                                                        |
| `APIError`             | 5xx                                                        |
| `ConnectionError`      | Network failure with no HTTP response                      |
| `UnexpectedResponseError` | A 2xx response whose body is not a JSON object          |
| `TimeoutError`         | `waitUntilComplete` deadline passed                        |

```ts
import { PaymentRequiredError, SmileIDError } from '@smileid/usesmileid-nodejs';

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

## License

MIT — see [LICENSE](LICENSE).
