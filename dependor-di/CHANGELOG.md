# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- `asValue`, `asFunction` and `asClass` definition builders.
- `.dependsOn(...names)`, `.singleton()` and `.transient()` on every definition.
- `createContainer(definitions, { eager })` with eager graph validation and
  eager singleton instantiation by default.
- `container.inject(name)` with a return type inferred from the definitions map.
- `container.has(name)` type guard and `container.names()`.
- `UnknownDependencyError`, `CircularDependencyError` (with a `path` of the
  cycle) and `InvalidDefinitionError`, all extending `DependorError`.
- Prototype-pollution guards: reserved service names are rejected and the
  container stores definitions on a frozen, `null`-prototype object.
- Dual ESM + CJS build with bundled type declarations; zero runtime
  dependencies.
- Supply-chain tooling: npm Trusted Publishing via GitHub OIDC with SLSA
  provenance, pinned lockfile, `npm ci --ignore-scripts` in CI, Dependabot,
  `npm audit`, GitHub dependency review and Socket scanning.
- `SECURITY.md`, `THREAT_MODEL.md` and a consumer verification guide in the
  README.

[Unreleased]: https://github.com/<PLACEHOLDER_GH>/wireup/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<PLACEHOLDER_GH>/wireup/releases/tag/v0.1.0
