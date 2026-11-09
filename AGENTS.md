# AGENTS.md

This repository holds Smile ID's V3 server-side SDK for JavaScript/TypeScript.

## Source of truth

The API surface comes from the OpenAPI specifications published at [smileidentity/api-reference](https://github.com/smileidentity/api-reference). Check the specs there before changing request/response shapes, and keep this SDK aligned with them.

## Layout

- `src/generated/` will hold generator-owned code once the OpenAPI generator is wired up. Treat it as read-only and don't hand-edit it.
- `src/client/`, `src/errors/`, and `src/helpers/` hold hand-written code and sit outside `src/generated/`.

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
