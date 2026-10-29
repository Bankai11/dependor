/**
 * Public type surface of dependor.
 *
 * Everything in this file is exported from the package entry point. No `any`
 * appears anywhere in the public API; unknown shapes are expressed with
 * `unknown` and narrowed by generics.
 *
 * @module
 */

/**
 * How long a resolved instance lives.
 *
 * - `'singleton'`: the first resolution is cached and reused for the lifetime
 *   of the container.
 * - `'transient'`: every call to {@link Container.inject} builds a fresh
 *   instance. This is the default for functions and classes.
 */
export type Lifetime = 'singleton' | 'transient';

/**
 * What kind of registration a {@link Definition} describes.
 */
export type DefinitionKind = 'value' | 'function' | 'class';

/**
 * A constructable class whose constructor takes `Args` and produces `T`.
 */
export type Constructor<T, Args extends readonly unknown[] = readonly unknown[]> = new (
  ...args: Args
) => T;

/**
 * A factory function that takes `Args` and produces `T`.
 */
export type Factory<T, Args extends readonly unknown[] = readonly unknown[]> = (
  ...args: Args
) => T;

/**
 * An immutable registration describing how to produce a value of type `T`.
 *
 * Definitions are created with {@link asValue}, {@link asFunction} and
 * {@link asClass}. Every builder method returns a **new** frozen definition;
 * the original is never mutated.
 *
 * @typeParam T - The type produced when this definition is resolved.
 */
export interface Definition<T> {
  /** The registration kind. */
  readonly kind: DefinitionKind;

  /** The lifetime applied when the container resolves this definition. */
  readonly lifetime: Lifetime;

  /**
   * Names of other services this definition depends on, in positional order.
   * The resolved instances are passed to the factory or constructor in this
   * same order.
   */
  readonly dependencies: readonly string[];

  /**
   * Declare the services this definition needs. Names are resolved from the
   * container at build time and passed positionally.
   *
   * @throws {InvalidDefinitionError} on a value definition, on an empty or
   *   non-string name, or on a prototype-pollution key such as `__proto__`.
   */
  dependsOn(...names: readonly string[]): Definition<T>;

  /** Return a copy of this definition with a `'singleton'` lifetime. */
  singleton(): Definition<T>;

  /**
   * Return a copy of this definition with a `'transient'` lifetime.
   *
   * @throws {InvalidDefinitionError} on a value definition, which is always
   *   a singleton by nature.
   */
  transient(): Definition<T>;

  /**
   * Produce an instance from already-resolved dependencies.
   *
   * This is called by the container. Consumers should not call it directly;
   * it is part of the type so that `T` can be inferred by
   * {@link Resolved}.
   *
   * @internal
   */
  readonly build: (resolvedDependencies: readonly unknown[]) => T;
}

/**
 * A map of service names to definitions, as accepted by
 * {@link createContainer}.
 */
export type Definitions = Readonly<Record<string, Definition<unknown>>>;

/**
 * Extract the service type produced by a definition.
 *
 * @example
 * ```ts
 * type T = Resolved<Definition<number>>; // number
 * ```
 */
export type Resolved<D> = D extends Definition<infer T> ? T : never;

/**
 * The string keys of a definitions map.
 */
export type ServiceName<Defs extends Definitions> = Extract<keyof Defs, string>;

/**
 * Options accepted by {@link createContainer}.
 */
export interface ContainerOptions {
  /**
   * When `true` (the default) the container validates the whole graph
   * **and** instantiates every singleton while it is being created, so
   * configuration and factory errors surface at startup rather than on the
   * first request.
   *
   * When `false` the graph is still validated eagerly (unknown and circular
   * dependencies always fail fast) but singletons are instantiated on first
   * use.
   */
  readonly eager?: boolean;
}

/**
 * A fully built, immutable dependency container.
 *
 * @typeParam Defs - The definitions map the container was created from. It
 *   drives the return type of {@link Container.inject}.
 */
export interface Container<Defs extends Definitions> {
  /**
   * The frozen snapshot of definitions this container was built from.
   * Mutating the object passed to {@link createContainer} after creation has
   * no effect on the container.
   */
  readonly definitions: Defs;

  /**
   * Resolve a single service by name. The return type is inferred from the
   * definition registered under that name.
   *
   * @throws {UnknownDependencyError} if `name` is not registered.
   * @throws Whatever the factory or constructor throws; errors are propagated
   *   unchanged and nothing is cached for a failed resolution.
   */
  inject<K extends ServiceName<Defs>>(name: K): Resolved<Defs[K]>;

  /** Whether a service with this name is registered. Acts as a type guard. */
  has(name: string): name is ServiceName<Defs>;

  /** All registered service names, in definition order. */
  names(): readonly ServiceName<Defs>[];
}
