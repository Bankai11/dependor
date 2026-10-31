# @wireupjs/core

A tiny, zero-dependency, type-safe dependency injection container for Node.js
and TypeScript. One file of runtime code, no decorators, no reflection, no
magic: you describe the graph, the container validates it, and `inject` hands
you fully typed instances.

- **Explicit wiring** with `asValue`, `asFunction`, `asClass` and `dependsOn`.
- **Lifetimes:** `singleton()` or `transient()` (the default).
- **Fail-fast:** unknown dependencies and cycles throw at `createContainer`,
  with the full cycle path in the error.
- **Typed end to end:** `container.inject('userService')` returns
  `UserService`, and an unregistered name is a compile error.
- **Hardened:** frozen, prototype-less definitions; reserved names rejected;
  no `eval`, `Function` or dynamic `require`.
- **Supply-chain conscious:** published only from CI via npm Trusted
  Publishing with SLSA provenance, zero runtime dependencies, pinned and
  audited dev toolchain. See [How to verify this package](#how-to-verify-this-package).

Ships as ESM and CommonJS with bundled `.d.ts` files. Requires Node 18+.

> **Not to be confused with** the unscoped `wireup` package on npm, which is
> an unrelated project.

## Install

```sh
npm install @wireupjs/core
# or, if your workflow allows, refuse all install scripts across the tree:
npm install @wireupjs/core --ignore-scripts
```

## Quick start: the full lifecycle

```ts
import { asClass, asFunction, asValue, createContainer } from '@wireupjs/core';

// 1. Plain application code. Nothing here knows about the container.
interface Config {
  dsn: string;
}

class Database {
  constructor(readonly dsn: string) {}
  query(sql: string) {
    return [`${this.dsn}: ${sql}`];
  }
}

class UserRepository {
  constructor(private readonly db: Database) {}
  findAll() {
    return this.db.query('SELECT * FROM users');
  }
}

class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly log: (msg: string) => void,
  ) {}
  list() {
    this.log('listing users');
    return this.users.findAll();
  }
}

// 2. Define the graph. Dependencies are passed positionally, in `dependsOn` order.
const container = createContainer({
  config: asValue<Config>({ dsn: 'postgres://localhost/app' }),

  log: asValue((msg: string) => console.log(msg)),

  db: asFunction((config: Config) => new Database(config.dsn))
    .dependsOn('config')
    .singleton(), // one connection for the whole app

  userRepository: asClass(UserRepository).dependsOn('db').singleton(),

  userService: asClass(UserService).dependsOn('userRepository', 'log'), // transient (default)
});

// 3. Resolve. `userService` is typed as UserService; 'nope' would not compile.
const userService = container.inject('userService');
userService.list();

container.has('db'); // true
container.names(); // ['config', 'log', 'db', 'userRepository', 'userService']
```

By default `createContainer` is **eager**: it validates the whole graph and
instantiates every singleton immediately, so a broken database URL fails at
startup rather than on the first request. Pass `{ eager: false }` to defer
singleton construction to first use (validation still happens up front).

## API

### Definitions

| Builder | Produces | Default lifetime | Notes |
| ------- | -------- | ---------------- | ----- |
| `asValue(value)` | `value` itself | singleton (always) | `dependsOn` and `transient` throw `InvalidDefinitionError`. |
| `asFunction(fn)` | `fn(...deps)` | transient | `fn` may return anything, including another function. |
| `asClass(Class)` | `new Class(...deps)` | transient | Any constructable class. |

Every definition has three chainable methods, each returning a **new frozen
definition** (the original is never mutated, so definitions can be shared):

- `.dependsOn(...names)`: the services to resolve and pass positionally.
- `.singleton()`: cache the first instance for the container's lifetime.
- `.transient()`: build a new instance on every `inject`.

And three readonly fields for introspection: `kind`, `lifetime`, `dependencies`.

### `createContainer(definitions, options?)`

Validates and builds a frozen container.

Throws (all subclasses of `DependorError`):

| Error | When |
| ----- | ---- |
| `InvalidDefinitionError` | `definitions` is not a plain object; a key is `""`, `__proto__`, `constructor` or `prototype`; a value was not produced by a builder. |
| `UnknownDependencyError` | a `dependsOn` name is not registered. `error.dependency` and `error.requestedBy` say which. |
| `CircularDependencyError` | the graph has a cycle. `error.path` is the closed cycle, e.g. `['a', 'b', 'a']`. |
| anything your factory throws | with `eager: true`, singleton factories run during creation and their errors propagate unchanged. |

Options: `{ eager?: boolean }` (default `true`).

### `Container<Defs>`

| Member | Description |
| ------ | ----------- |
| `inject(name)` | Resolve a service. Return type is inferred from `definitions[name]`. Throws `UnknownDependencyError` for unregistered names. Factory errors propagate unchanged, and a failed singleton is **not** cached, so the next call retries. |
| `has(name)` | `true` if registered. Narrows `string` to the registered-name union. |
| `names()` | Frozen array of registered names in definition order. |
| `definitions` | The frozen, `null`-prototype snapshot the container was built from. |

### Types

`Definition<T>`, `Definitions`, `Container<Defs>`, `ContainerOptions`,
`Lifetime`, `DefinitionKind`, `Constructor<T, Args>`, `Factory<T, Args>`,
`Resolved<D>` (unwraps a `Definition<T>` to `T`) and `ServiceName<Defs>` are
all exported.

```ts
import type { Container, Resolved } from '@wireupjs/core';

const defs = { answer: asValue(42) };
type App = Container<typeof defs>;
type Answer = Resolved<(typeof defs)['answer']>; // number
```

### Error handling

```ts
import { CircularDependencyError, DependorError, createContainer } from '@wireupjs/core';

try {
  createContainer(definitions);
} catch (error) {
  if (error instanceof CircularDependencyError) {
    console.error('cycle:', error.path.join(' -> '));
  } else if (error instanceof DependorError) {
    console.error('wiring problem:', error.message);
  } else {
    throw error; // a factory failed; it is your error, not ours
  }
}
```

## Design notes

- **Positional dependencies, not named.** `dependsOn('a', 'b')` maps to
  `fn(a, b)`. This keeps factories ordinary functions that are trivially
  testable without the container, and keeps the library free of parameter
  parsing or decorators.
- **Validation before resolution.** The graph is proven acyclic before any
  factory runs, so resolution is a plain recursive walk with no runtime cycle
  bookkeeping.
- **Immutability everywhere.** Definitions, the definitions snapshot, the
  names array and the container itself are `Object.freeze`d. The snapshot has
  a `null` prototype, so `inject('toString')` is an `UnknownDependencyError`,
  not a function.
- **Errors are yours.** The container never wraps factory errors. Your
  `instanceof` checks and stack traces keep working.

## How to verify this package

Every release is published **only** from GitHub Actions using npm Trusted
Publishing (OIDC, no long-lived tokens) with `npm publish --provenance`, which
attaches a Sigstore-signed SLSA provenance attestation. Here is how to check
that what you installed is what this repository's CI built.

1. **Verify registry signatures and provenance.**

   ```sh
   npm install @wireupjs/core
   npm audit signatures
   ```

   Expect `verified registry signatures` and `verified attestations` counts
   with zero `missing` or `invalid`. This checks the registry's signature on
   the tarball *and* the provenance attestation against the Sigstore
   transparency log.

2. **Inspect the attestation on npm.** Open
   `https://www.npmjs.com/package/@wireupjs/core/v/<version>` and look for
   the **Provenance** panel ("Built and signed on GitHub Actions"). It names
   the source commit, the workflow file (`.github/workflows/publish.yml`) and
   links to the exact Actions run. Each GitHub release in this repo links to
   its npm version page. You can also print it from the CLI:

   ```sh
   npm view @wireupjs/core@<version> dist.attestations
   ```

3. **Compare the tarball hash with the GitHub release asset.** CI attaches
   the exact tarball it published, plus a `.sha256` file, to the GitHub
   release.

   ```sh
   # What the registry serves:
   npm pack @wireupjs/core@<version>
   sha256sum wireupjs-core-<version>.tgz

   # What CI built (download from https://github.com/Bankai11/dependor/releases/tag/v<version>):
   cat wireupjs-core-<version>.tgz.sha256
   ```

   The two hashes must match. `npm pack --dry-run` on the installed package
   should list only `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`,
   `dist/index.d.cts`, `package.json`, `README.md`, `LICENSE` and
   `CHANGELOG.md`.

4. **Check the package metadata points at the real repo.**

   ```sh
   npm view @wireupjs/core repository.url homepage bugs.url
   ```

   All three must reference `github.com/Bankai11/dependor`. A typosquat can
   copy this README but cannot produce a provenance attestation naming this
   repository.

5. **Review the Actions run that produced the release.** Follow the link from
   the provenance panel (or the release page) to the `Publish` workflow run.
   It should be green, triggered by a `release: published` event for tag
   `v<version>`, and its final step "Verify published package" prints the
   built and registry SHA-256 hashes side by side.

6. **Provenance is not security.** Steps 1 through 5 prove *where the code came
   from*: this repository, this workflow, this commit. They do **not** prove
   the code is free of bugs, or that the repository and its maintainers were
   not compromised at that commit. If this library sits in a high-risk
   position in your system, read the source diff between the version you run
   and the one you are adopting (`dist/index.js` is unminified and about 200
   lines) and use the checklist in [`THREAT_MODEL.md`](./THREAT_MODEL.md).

## Security

See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability (90-day
coordinated disclosure) and [`THREAT_MODEL.md`](./THREAT_MODEL.md) for what is
and is not defended against.

Summary of supply-chain controls in this repository:

| Control | Implementation |
| ------- | -------------- |
| No long-lived publish tokens | npm Trusted Publishing via GitHub OIDC (`id-token: write`) |
| Signed provenance on every release | `npm publish --provenance`, verified post-publish with `npm audit signatures` |
| Reproducible dev toolchain | exact-pinned devDependencies, `package-lock.json` with `sha512` integrity, `npm ci --ignore-scripts`, Node pinned to `24.22.2` |
| Zero runtime dependencies | enforced in CI |
| No install-time scripts | enforced in CI |
| Vulnerability gates | `npm audit --audit-level=high`, GitHub Dependency Review (fail on high), Socket.dev scan on PRs |
| Weekly updates | Dependabot for npm and GitHub Actions |
| Minimal tarball | `files` whitelist, no source maps, unminified output for review |
| Publish only from CI | release-triggered workflow on a protected `npm` environment |

## Development

```sh
npm ci --ignore-scripts   # install exactly the locked toolchain
npm run typecheck         # tsc --noEmit over src and tests
npm test                  # Vitest: unit + integration + type tests, 95% coverage gate
npm run build             # tsup -> dist/ (ESM, CJS, d.ts)
npm run check             # all of the above plus `npm pack --dry-run`
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
and releases follow [Semantic Versioning](https://semver.org/). To release:
bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, tag
`vX.Y.Z`, and publish a GitHub release for that tag. The `Publish` workflow
does the rest. Never run `npm publish` from a laptop.

## License

[MIT](./LICENSE)
