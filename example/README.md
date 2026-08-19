# Smile ID JavaScript SDK Example

This repository is a small TypeScript command-line application that demonstrates the public `@smileid/usesmileid-nodejs` server-side SDK.

It also acts as a testbench: the tests run the same CLI code with the SDK's public injectable `fetch` option and verify the HTTP requests the SDK would send.

## Requirements

- Node.js 18 or later. Development and CI use the version pinned in the SDK's `.nvmrc`.
- Smile ID credentials for real API calls.

## Setup

This example depends on the sibling SDK checkout:

```json
"@smileid/usesmileid-nodejs": "file:.."
```

Install dependencies:

```bash
npm install
```

## Configuration

```bash
export SMILE_PARTNER_ID="2"
export SMILE_API_KEY="..."
export SMILE_BASE_URL="https://your-environment.example.com"
export SMILE_CALLBACK_URL="https://your-app.example.com/smile-callback"
```

Partner ids are displayed zero-padded (for example 002) but must be passed without leading zeros (2).

`SMILE_BASE_URL` sets the host to call. Leave it unset to use the SDK default, the sandbox at `https://testapi.smileidentity.com`. The only named environments are sandbox and production, so any other host needs this variable or the `--base-url` flag.

Optional:

- `SMILE_TIMEOUT_MS` sets the per-request timeout.

Each variable has a matching global flag: `--partner-id`, `--api-key`, `--base-url`, `--callback-url` and `--timeout-ms`. A global flag may go before or after the command name, and overrides the environment.

## Commands

```bash
npm run build
node dist/index.js services --country NG
node dist/index.js --base-url https://your-environment.example.com services --country NG
node dist/index.js enhanced-kyc --country NG --id-type NIN --id-number 12345678901 --given-names "Amina Fatou" --last-name Clearwater --email amina.clearwater@example.com --privacy-url https://your-app.example.com/privacy
node dist/index.js status --job-id job_...
node dist/index.js status --job-id job_... --base-url https://your-environment.example.com
node dist/index.js replay --job-id job_... --callback-url https://your-app.example.com/smile-callback
```

Non-production environments match test identities on given names, last name and email. An unrecognised identity resolves to `block`.

`status` prints the job status as the API returns it: `processing` while the job runs, `not_found` for an unknown job, and otherwise the decision itself — `clear`, `block`, `attention` or `error`.

```json
{
  "status": "clear",
  "message": "Job completed",
  "jobId": "job_...",
  "userId": "user_..."
}
```

## Development

```bash
npm test
npm run lint
```

The testbench does not use Smile ID credentials and does not open network sockets.
