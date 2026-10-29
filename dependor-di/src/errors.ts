/**
 * Error types thrown by dependor.
 *
 * All errors extend {@link DependorError}, so consumers can catch the whole
 * family with a single `instanceof` check. Factory and constructor errors are
 * **not** wrapped; they propagate exactly as thrown so stack traces and
 * `instanceof` checks against the consumer's own error classes keep working.
 *
 * @module
 */

/**
 * Base class for every error raised by dependor itself.
 */
export class DependorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependorError';
  }
}

/**
 * Thrown when a definition is malformed: a non-function passed to
 * `asFunction`/`asClass`, an invalid or forbidden service name, a lifetime
 * change on a value definition, or a definitions map that is not a plain
 * object.
 */
export class InvalidDefinitionError extends DependorError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDefinitionError';
  }
}

/**
 * Thrown when a service name is requested or declared as a dependency but no
 * definition with that name exists.
 */
export class UnknownDependencyError extends DependorError {
  /** The missing service name. */
  readonly dependency: string;

  /** The service that declared the dependency, or `undefined` for a direct `inject` call. */
  readonly requestedBy: string | undefined;

  constructor(dependency: string, requestedBy?: string) {
    const suffix = requestedBy === undefined ? '' : ` (required by "${requestedBy}")`;
    super(`Unknown dependency "${dependency}"${suffix}`);
    this.name = 'UnknownDependencyError';
    this.dependency = dependency;
    this.requestedBy = requestedBy;
  }
}

/**
 * Thrown when the dependency graph contains a cycle. The `path` property
 * lists the services on the cycle, starting and ending with the same name,
 * e.g. `['a', 'b', 'c', 'a']`.
 */
export class CircularDependencyError extends DependorError {
  /** The cycle, as a closed path of service names. */
  readonly path: readonly string[];

  constructor(path: readonly string[]) {
    super(`Circular dependency detected: ${path.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.path = Object.freeze([...path]);
  }
}
