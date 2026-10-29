# Security Policy

## Supported versions

Only the latest minor release line receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately through either channel:

1. **GitHub private vulnerability reporting** (preferred):
   <https://github.com/Bankai11/dependor/security/advisories/new>
2. **Email:** `security@wireup.dev`

Include, where you can:

- the affected version (`npm ls @wireup/core`),
- a minimal reproduction or proof of concept,
- the impact you believe it has,
- whether you want public credit.

You will get an acknowledgement within **3 business days** and a triage
decision (accepted / not a vulnerability / needs more info) within **10
business days**.

## Disclosure policy

This project follows a **90-day coordinated disclosure** policy:

- We aim to ship a fix and publish a GitHub Security Advisory as soon as
  possible, and in any case within 90 days of the report.
- If a fix is ready sooner, we will coordinate a release date with you.
- If 90 days pass without a fix, you are free to disclose publicly. We ask
  that you tell us first so we can publish mitigations alongside.
- Actively exploited issues may be disclosed earlier with a mitigation.

Credit is given in the advisory and `CHANGELOG.md` unless you ask otherwise.

## Scope

In scope:

- Any behaviour of this library that lets a definitions map or service name
  escape the documented API: prototype pollution, unexpected code execution,
  state leaking between containers.
- Weaknesses in the release pipeline: publishing without provenance,
  tarball contents not matching the tagged source, lockfile tampering.

Out of scope (see `THREAT_MODEL.md` for the full list):

- Vulnerabilities in Node.js itself or in consumers' own factories/classes.
- Issues that require the attacker to already control the definitions passed
  to `createContainer` *and* the process they run in.
- Denial of service through deliberately enormous dependency graphs.

## Verifying what you install

Every release is published from CI with npm Trusted Publishing and a signed
SLSA provenance attestation. See **"How to verify this package"** in the
README for the step-by-step check, starting with:

```sh
npm audit signatures
```
