# AGENTS.md

This repository holds Smile ID's V3 server-side SDK for JavaScript/TypeScript.

## Source of truth

The API surface (endpoints, request and response shapes) comes from `specs/v3/openapi.yaml` in [smileidentity/api-reference](https://github.com/smileidentity/api-reference). Read it at a release tag such as `v3.1115.0`, not at `main`. When a task or pull request names a tag, use that one. When the SDK and the spec disagree, the spec wins.

- Ignore anything marked `x-smile-sdk-exclude: true` or `x-internal: true`. These are server-to-server details, such as the HMAC signature headers, that the SDKs leave out on purpose. The SDK doesn't sign requests. It authenticates every call with the spec's `SmileIDToken` scheme: it gets a token from `POST /v3/token` and sends it in the `SmileID-Token` header, in `src/client/transport.ts`. Keep that code when you ignore the excluded headers.
- Don't add endpoints or fields that aren't in the spec. Internal endpoints are kept out of it on purpose.

## Layout

- `src/generated/models/` and `src/generated/operations/` hold wire models and per-operation functions. They are hand-written for now, because there is no generator yet. Edit it by hand, but keep it shaped like generator output: wire models and one thin function per operation, with no business logic. A generator will replace it later.
- `src/client/`, `src/errors/`, and `src/helpers/` hold the rest of the hand-written code.
- `src/testing/` holds the mock transport used by the tests.

## Keeping the SDKs in step

This SDK is one of the `smileid-sdk-*` repositories, which share one design. A change to the public API here should be made the same way in the others: the same operations, option names and defaults, adjusted only for each language's naming conventions.

Automated pull requests use these labels and branches:

| Label | Branch | Meaning |
|---|---|---|
| `spec-sync` | `spec-sync/rolling` | Brings the SDK up to a new spec tag. There is one rolling pull request at a time, and the automation finds it by this branch name, so don't open another. |
| `spec-sync` | `spec-sync/<scope>` | A run limited to one product, such as the backlog run split by product. |
| `spec-sync` and `breaking` | `spec-sync/breaking-<tag>` | A change that needs a major release. Breaking changes always get their own pull request. |
| `release` | `release/vX.Y.Z` | A version bump and changelog entry. Made by hand for now. An automated release train is planned. |

Porting changes between SDKs automatically, with the `parity-port` label, is planned but not built yet.

The `breaking` label is not only for automation. CI fails any pull request that breaks the public API unless it has the `breaking` label, including pull requests made by hand.

Add `parity:skip` to a pull request that should not be ported to the other SDKs.

Tests:

- Every new operation needs a golden fixture test, which checks the exact request body and headers, and tests that parse its responses. Golden fixture tests live in `src/generated/operations/serialization.test.ts`; follow the existing cases there. Shared persona cases for integration tests live in the private `smileid-sdk-fixtures` repository.
- Changed lines must be fully covered by tests. Don't add coverage exclusion comments.

## Running tests

```
npm test
```

This builds the TypeScript sources and runs the test suite against the compiled output.

## Quality gates

CI runs these on every pull request (`.github/workflows/quality-gates.yml`):

- `api-compat` compares the public API with the latest `v*` release using `@microsoft/api-extractor`. Removing or changing a declaration fails unless the PR has the `breaking` label. Run it locally with `scripts/api-report.sh <ref> <file>` and `node scripts/api-compat.mjs`.
- `coverage` runs `npm run coverage` (c8, Cobertura and LCOV in `coverage/`). `src/generated/` must have 100% line and branch coverage (`npm run coverage:generated`). Write tests rather than excluding code: bot PRs fail if they add coverage-exclusion comments or leave changed lines uncovered.

`scripts/bump-version.sh <major|minor|patch>` sets the new version and moves the changelog's Unreleased entries under it.

`release.yml` runs `scripts/check-release-breaking.sh`: a release must bump the major version if, and only if, it contains a PR labelled `breaking` (0.x to 1.0.0 needs none). Script tests run in the `scripts` job.

## Org-wide conventions

Org-wide agent conventions live at [smileidentity/agents](https://github.com/smileidentity/agents) (a private repository, for internal contributors).
