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

## Org-wide conventions

Org-wide agent conventions live at [smileidentity/agents](https://github.com/smileidentity/agents) (a private repository, for internal contributors).
