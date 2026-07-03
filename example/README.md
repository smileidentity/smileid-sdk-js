# Smile ID JavaScript SDK Example

This repository is a small TypeScript command-line application that demonstrates the public `@smileid/smileid` server-side SDK.

It also acts as a testbench: the tests run the same CLI code with the SDK's public injectable `fetch` option and verify the HTTP requests the SDK would send.

## Requirements

- Node.js 18 or later.
- Smile ID sandbox credentials for real API calls.

## Setup

This example depends on the sibling SDK checkout:

```json
"@smileid/smileid": "file:.."
```

Install dependencies:

```bash
npm install
```

## Configuration

```bash
export SMILE_PARTNER_ID="12345"
export SMILE_API_KEY="..."
export SMILE_CALLBACK_URL="https://your-app.example.com/smile-callback"
```

Optional:

- `SMILE_PARTNER_SECRET` enables optional HMAC request signing.
- `SMILE_BASE_URL` overrides the SDK environment URL.
- `SMILE_TIMEOUT_MS` sets the per-request timeout.

## Commands

```bash
npm run build
node dist/index.js services --country NG
node dist/index.js enhanced-kyc --country NG --id-type NIN --id-number 12345678901 --given-names Amina --last-name Okafor --email amina@example.com --privacy-url https://your-app.example.com/privacy
node dist/index.js status --job-id job_...
node dist/index.js replay --job-id job_... --callback-url https://your-app.example.com/smile-callback
```

## Development

```bash
npm test
npm run lint
```

The testbench does not use Smile ID credentials and does not open network sockets.
