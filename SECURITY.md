# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in this SDK, please report it privately rather than opening a public issue.

**Email:** [security@smileidentity.com](mailto:security@smileidentity.com)

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof-of-concept if available.
- Any relevant request/response samples (with sensitive data redacted).
- Your contact details, so we can follow up.

We aim to acknowledge reports within **3 business days** and to provide a substantive response within **10 business days**. Please give us a reasonable opportunity to address the issue before any public disclosure.

## Scope

This repository contains the source code and tests for Smile ID's server-side JavaScript/TypeScript SDK. Reports relating to any of the following are in scope and welcome:

- Vulnerabilities in the SDK's source code (for example, insecure handling of credentials or signed payloads).
- Supply-chain concerns in this repository's dependencies or CI workflows.
- Vulnerabilities in the deployed Smile ID API endpoints that this SDK calls.

## Out of scope

- Vulnerabilities in third-party services we link to (please report those to the relevant vendor).
- Findings that require physical access, social engineering, or DoS testing against production endpoints.
