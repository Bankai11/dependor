/**
 * Definition builders: `asValue`, `asFunction`, `asClass`.
 *
 * A definition is an immutable description of *how* to produce a service. It
 * holds no instances and no container state. Each builder method returns a
 * new frozen object so definitions can be shared between containers safely.
 *
 * @module
 */

import { InvalidDefinitionError } from './errors.js';
import type { Constructor, Definition, DefinitionKind, Factory, Lifetime } from './types.js';

/**
 * Keys that must never be used as service names. Using them as property keys
 * on an ordinary object would walk or alter the prototype chain.
 *
 * SECURITY-SENSITIVE: this list is the prototype-pollution guard for every
 * place a user-supplied string becomes an object key.
 */
const FORBIDDEN_NAMES: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate that `name` is usable as a service name.
 *
 * @throws {InvalidDefinitionError} if `name` is not a non-empty string or is
 *   a forbidden prototype key.
 * @internal
 */
export function assertValidServiceName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new InvalidDefinitionError(
      `Service names must be non-empty strings, received ${describe(name)}`,
    );
  }
  if (FORBIDDEN_NAMES.has(name)) {
    throw new InvalidDefinitionError(`Service name "${name}" is reserved and cannot be used`);
  }
}

function describe(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  return typeof value;
}

/**
 * The single concrete implementation behind every definition. The class is
 * not exported; the container recognises definitions with `isDefinition`.
 */
class DefinitionImpl<T> implements Definition<T> {
  readonly kind: DefinitionKind;
  readonly lifetime: Lifetime;
  readonly dependencies: readonly string[];
  readonly build: (resolvedDependencies: readonly unknown[]) => T;

  constructor(
    kind: DefinitionKind,
    lifetime: Lifetime,
    dependencies: readonly string[],
    build: (resolvedDependencies: readonly unknown[]) => T,
  ) {
    this.kind = kind;
    this.lifetime = lifetime;
    this.dependencies = Object.freeze([...dependencies]);
    this.build = build;
    Object.freeze(this);
  }

  dependsOn(...names: readonly string[]): Definition<T> {
    if (this.kind === 'value') {
      throw new InvalidDefinitionError('A value definition cannot declare dependencies');
    }
    for (const name of names) {
      assertValidServiceName(name);
    }
    return new DefinitionImpl(this.kind, this.lifetime, names, this.build);
  }

  singleton(): Definition<T> {
    return new DefinitionImpl(this.kind, 'singleton', this.dependencies, this.build);
  }

  transient(): Definition<T> {
    if (this.kind === 'value') {
      throw new InvalidDefinitionError('A value definition is always a singleton');
    }
    return new DefinitionImpl(this.kind, 'transient', this.dependencies, this.build);
  }
}

/**
 * Whether `candidate` was produced by one of this module's builders.
 *
 * Uses `instanceof` against the private class, so a look-alike object cannot
 * be smuggled in as a definition.
 *
 * @internal
 */
export function isDefinition(candidate: unknown): candidate is Definition<unknown> {
  return candidate instanceof DefinitionImpl;
}

/**
 * Register a literal value. The value is returned as-is on every resolution
 * and is therefore always a singleton.
 *
 * @example
 * ```ts
 * const config = asValue({ port: 3000 });
 * ```
 */
export function asValue<T>(value: T): Definition<T> {
  return new DefinitionImpl<T>('value', 'singleton', [], () => value);
}

/**
 * Register a factory function. Dependencies declared with `dependsOn` are
 * passed positionally as arguments. Transient by default.
 *
 * @example
 * ```ts
 * const logger = asFunction((config: Config) => createLogger(config.level))
 *   .dependsOn('config')
 *   .singleton();
 * ```
 * @throws {InvalidDefinitionError} if `factory` is not a function.
 */
export function asFunction<T, Args extends readonly unknown[]>(
  factory: Factory<T, Args>,
): Definition<T> {
  if (typeof factory !== 'function') {
    throw new InvalidDefinitionError(`asFunction expects a function, received ${describe(factory)}`);
  }
  return new DefinitionImpl<T>('function', 'transient', [], (deps) => factory(...(deps as Args)));
}

/**
 * Register a class. Dependencies declared with `dependsOn` are passed
 * positionally to the constructor. Transient by default.
 *
 * @example
 * ```ts
 * const userService = asClass(UserService).dependsOn('userRepository').singleton();
 * ```
 * @throws {InvalidDefinitionError} if `Class` is not a function.
 */
export function asClass<T, Args extends readonly unknown[]>(
  Class: Constructor<T, Args>,
): Definition<T> {
  if (typeof Class !== 'function') {
    throw new InvalidDefinitionError(`asClass expects a class, received ${describe(Class)}`);
  }
  return new DefinitionImpl<T>('class', 'transient', [], (deps) => new Class(...(deps as Args)));
}
