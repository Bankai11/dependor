# Threat Model

This document describes what `@wireup/core` defends against, how, and
what it deliberately does not. It is written for two audiences: maintainers
deciding whether a change weakens a control, and consumers deciding whether
to adopt a release.

## 1. What we are protecting

| Asset | Why it matters |
| ----- | -------------- |
| The published tarball on npm | Executed inside every consumer's process at startup. |
| The npm package name `@wireup/core` | Whoever controls it controls future releases. |
| The GitHub repository and its `main` branch | Source of truth; what provenance attests to. |
| The release workflow (`.github/workflows/publish.yml`) | The only path that is allowed to publish. |
| The lockfile (`package-lock.json`) | Pins the dev toolchain that builds and tests releases. |
| Consumers' processes | A DI container sits at the root of the object graph; compromising it compromises everything built through it. |

## 2. Attacks in scope and their mitigations

### 2.1 Account takeover of a maintainer (npm or GitHub)

*Attacker publishes a malicious version using stolen credentials.*

| Mitigation | Where |
| ---------- | ----- |
| **Trusted Publishing**: npm accepts publishes only from the configured GitHub workflow via short-lived OIDC tokens. No `NPM_TOKEN` exists to steal. | `publish.yml` (`id-token: write`), npm package settings |
| Publishing is tied to a GitHub **release** event on a protected `npm` environment that can require reviewer approval. | `publish.yml` `environment: npm` |
| **2FA required** on the npm account and GitHub org/user for any manual action (recommended setting, enforced out of band). | npm / GitHub settings |
| Every publish carries a **signed provenance attestation**; a publish from anywhere else would have no attestation (or one naming the wrong repo/workflow), which `npm audit signatures` and the npm UI expose. | `--provenance` |

**Residual risk:** an attacker with write access to the GitHub repo *and* the
ability to create a release could still publish. Branch protection, required
reviews and environment approvals are the controls; they live in GitHub
settings, not in this repo, so verify them.

### 2.2 Typosquatting and dependency confusion

*Attacker publishes `wireupp`, `@wireup/core-js`, or the unscoped
`wireup` package and hopes consumers install the wrong one.*

| Mitigation | Where |
| ---------- | ----- |
| The package is **scoped** (`@wireup/...`). Only the scope owner can publish into it, which removes the classic unscoped-name confusion attack. | `package.json` `name` |
| `repository`, `homepage` and `bugs` all point to the same GitHub repo, and provenance cryptographically links the tarball to that repo. A squatted package cannot forge that link. | `package.json`, provenance |
| The README tells consumers to compare these fields and the attestation before adopting. | README "How to verify" |

Note: the bare name `wireup` on npm is **not** this project. Do not install it expecting this library.

### 2.3 Malicious install-time scripts

*A compromised version (of this package or of a devDependency) runs code on `npm install`.*

| Mitigation | Where |
| ---------- | ----- |
| This package ships **no** `preinstall`/`install`/`postinstall`/`prepare` scripts; CI fails if one is added. | `ci.yml` "No lifecycle scripts" |
| CI installs with `npm ci --ignore-scripts`, so a compromised devDependency cannot execute during the build that produces a release. | `ci.yml`, `publish.yml` |
| Consumers are advised to install with `--ignore-scripts` where their workflow allows. | README |

### 2.4 Compromised devDependencies / build toolchain

*A malicious TypeScript, tsup or Vitest release alters the emitted JavaScript.*

| Mitigation | Where |
| ---------- | ----- |
| **Zero runtime dependencies**, so this class of attack can only affect the build, never the consumer's `node_modules` tree. CI enforces the empty `dependencies` field. | `package.json`, `ci.yml` |
| devDependencies are **pinned to exact versions** and locked with `sha512` integrity hashes; `npm ci` refuses to install anything that disagrees with the lockfile. | `package.json`, `package-lock.json`, `.npmrc` |
| Dependabot opens weekly PRs; each runs `npm audit --audit-level=high`, GitHub Dependency Review (fails on high/critical) and a Socket.dev behavioural scan before merge. | `dependabot.yml`, `dependency-review.yml` |
| The build is **unminified** and shipped without source maps, so reviewers can diff `dist/` against `src/` by eye. Provenance ties `dist/` to the exact commit. | `tsup.config.ts` |
| Build output is grepped for `eval`, `new Function` and source maps in CI. | `ci.yml` |

**Residual risk:** a sufficiently subtle compiler backdoor could survive
review. Mitigated by small output (about 6 KB per format) and by provenance
letting anyone rebuild from the attested commit and compare.

### 2.5 Tampering between build and publish

*Attacker swaps the tarball after tests pass but before it reaches npm.*

| Mitigation | Where |
| ---------- | ----- |
| The tarball is built **once**, checksummed, and that exact file is what `npm publish` uploads; the checksum is verified in the publish job. | `publish.yml` |
| After publishing, CI downloads the version back from the registry, compares its SHA-256 to the built one, and runs `npm audit signatures`. A mismatch fails the release. | `publish.yml` "Verify published package" |
| The tarball and `.sha256` are attached to the GitHub release so consumers can compare independently. | `publish.yml` |

### 2.6 Prototype pollution via the library's own API

*Consumer code builds the definitions map from untrusted input (e.g. plugin
names from config) and an attacker supplies `__proto__` as a service name.*

| Mitigation | Where |
| ---------- | ----- |
| Service names `__proto__`, `constructor` and `prototype` are rejected at definition and container-creation time. | `definitions.ts` `assertValidServiceName` |
| Definitions are copied into a **`null`-prototype, frozen** object; lookups use `Object.hasOwn`, never `in` or truthiness, so `toString` and friends are not resolvable. | `container.ts` `snapshotDefinitions`, `inject`, `has` |
| Only objects created by `asValue`/`asFunction`/`asClass` are accepted (`instanceof` against a private class), so a crafted look-alike cannot inject a custom `build`. | `definitions.ts` `isDefinition` |
| Containers and definitions are `Object.freeze`d; no `eval`, `Function`, dynamic `require` or `import()` anywhere. | all of `src/` |

### 2.7 Information disclosure through the package

| Mitigation | Where |
| ---------- | ----- |
| `files` whitelist publishes only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`: no tests, configs, CI files or source maps. `npm pack --dry-run` runs in CI so the list is visible in every log. | `package.json`, `ci.yml` |
| Error messages include only service names the consumer chose, never resolved values. | `errors.ts` |

## 3. Explicitly out of scope

- **Vulnerabilities in Node.js, V8 or the npm CLI itself.** We pin versions in
  CI and track advisories, but cannot fix them.
- **Malicious or buggy factories, classes and values supplied by the consumer.**
  The container calls what you register with the arguments you declared. It
  does not sandbox them.
- **Consumer misuse**, such as registering secrets with `asValue` and then
  logging the container, or building the definitions map from untrusted input
  without their own validation (the prototype guards above are a backstop, not
  a substitute).
- **Denial of service** through absurdly large or deep graphs. Resolution is
  recursive; a graph tens of thousands of levels deep can exhaust the stack.
  Definitions are code, not user input, in the intended use.
- **Compromise of GitHub or npm infrastructure** (e.g. a forged OIDC token
  issued by GitHub, or Sigstore's transparency log being subverted).
- **Side channels, timing attacks** and anything requiring a compromised host.
- **Runtime availability** of `npm audit signatures`: if the registry's
  signing keys rotate, verification tooling must be updated by npm, not us.

## 4. Consumer checklist before adopting a new version

Copy this into your upgrade PR.

- [ ] `npm view @wireup/core@<version> dist.attestations` shows a
      provenance attestation, and the npm web page for the version has the
      "Built and signed on GitHub Actions" panel.
- [ ] `npm audit signatures` passes after `npm install` in a clean tree.
- [ ] The attestation's **source repository** is
      `github.com/Bankai11/dependor`, the **workflow** is
      `.github/workflows/publish.yml`, and the **commit** is tagged
      `v<version>` in that repo.
- [ ] The GitHub Actions run linked from the attestation is green and its
      "Verify published package" step shows matching SHA-256 hashes.
- [ ] `npm pack @wireup/core@<version> --dry-run` lists only
      `dist/index.{js,cjs,d.ts,d.cts}`, `package.json`, `README.md`,
      `LICENSE`, `CHANGELOG.md`. No `.map`, no `test/`, no `.github/`.
- [ ] `package.json` in the tarball has **empty** `dependencies` and **no**
      `preinstall`/`install`/`postinstall`/`prepare` scripts.
- [ ] `CHANGELOG.md` has an entry for this version and the diff
      `v<previous>...v<version>` on GitHub matches it.
- [ ] You have skimmed `dist/index.js` (about 200 lines, unminified). It
      should contain no network, filesystem, `child_process`, `eval` or
      `Function` usage.
- [ ] Your own tests pass with the new version pinned exactly (no `^`).

**Provenance proves origin, not safety.** A green checklist tells you the
code came from this repository's CI at a specific commit. It does not tell
you the code is bug-free or that the repository itself has not been
compromised. High-risk consumers should review the source diff between
versions.
