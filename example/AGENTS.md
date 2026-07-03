# AGENTS.md

This repository is a standalone example application for the Smile ID JavaScript SDK.

## Development rules

- Use only the public API exported by `@smileid/smileid`.
- Keep tests deterministic by injecting `fetch`; do not require real Smile ID credentials for unit or integration-style tests.
- Keep examples small and explicit.
- Keep credentials out of source control and docs.
- Run `npm test` before handing off changes.

## Layout

- `src/index.ts` is the executable entrypoint.
- `src/app.ts` contains command parsing and SDK calls.
- `src/app.test.ts` is the SDK testbench.
- `.github/workflows/ci.yml` runs tests, lint, and Semgrep.
- `.github/dependabot.yml` keeps npm and GitHub Actions current.
