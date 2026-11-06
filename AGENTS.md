# AGENTS.md

This repository holds Smile ID's V3 server-side SDK for JavaScript/TypeScript.

## Source of truth

The API surface (endpoints, request and response shapes) comes from `specs/v3/openapi.yaml` in [smileidentity/api-reference](https://github.com/smileidentity/api-reference). Read it at a release tag such as `v3.1115.0`, not at `main`. When a task or pull request names a tag, use that one. When the SDK and the spec disagree, the spec wins.

- Ignore anything marked `x-smile-sdk-exclude: true`. These are server-to-server details, such as the HMAC signature headers, that the SDKs leave out on purpose.
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
| `spec-sync` | `bot/spec-sync` | Brings the SDK up to a new spec tag. One rolling pull request at a time. |
| `breaking` | `bot/spec-sync-breaking-<tag>` | A change that needs a major release. Breaking changes always get their own pull request. |
| `parity-port` | `bot/parity-port-<repo>-<number>` | A change ported from another SDK's merged pull request, which it links to. |
| `release` | `bot/release-v<version>` | A version bump and changelog entry. |

Add `parity:skip` to a pull request that should not be ported to the other SDKs.

Tests:

- Every new operation needs a golden fixture test, which checks the exact request body and headers, and tests that parse its responses.
- Changed lines must be fully covered by tests. Don't add coverage exclusion comments.

## Running tests

```
npm test
```

This builds the TypeScript sources and runs the test suite against the compiled output.

## Org-wide conventions

Org-wide agent conventions live at [smileidentity/agents](https://github.com/smileidentity/agents) (a private repository, for internal contributors).
