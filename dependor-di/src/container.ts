/**
 * Container construction and resolution.
 *
 * `createContainer` does all validation up front: it checks that every entry
 * is a real definition, that every declared dependency exists, and that the
 * graph is acyclic. Only then does it resolve anything. Resolution itself is
 * a plain recursive walk with a singleton cache; because the graph has already
 * been proven acyclic, the walk cannot loop.
 *
 * @module
 */

import { assertValidServiceName, isDefinition } from './definitions.js';
import { CircularDependencyError, InvalidDefinitionError, UnknownDependencyError } from './errors.js';
import type { Container, ContainerOptions, Definitions, Resolved, ServiceName } from './types.js';

/**
 * Copy the user's definitions into a frozen, prototype-less object.
 *
 * SECURITY-SENSITIVE: the copy has a `null` prototype so lookups like
 * `definitions['toString']` cannot hit `Object.prototype`, and it is frozen
 * so no later mutation of the caller's object or of the snapshot can change
 * what the container resolves.
 */
function snapshotDefinitions<Defs extends Definitions>(definitions: Defs): Defs {
  if (typeof definitions !== 'object' || definitions === null || Array.isArray(definitions)) {
    throw new InvalidDefinitionError('createContainer expects a plain object of definitions');
  }

  const snapshot: Record<string, Definitions[string]> = Object.create(null) as Record<
    string,
    Definitions[string]
  >;

  for (const name of Object.keys(definitions)) {
    assertValidServiceName(name);
    const definition: unknown = definitions[name];
    if (!isDefinition(definition)) {
      throw new InvalidDefinitionError(
        `Definition for "${name}" must be created with asValue, asFunction or asClass`,
      );
    }
    snapshot[name] = definition;
  }

  return Object.freeze(snapshot) as Defs;
}

/**
 * Verify every declared dependency exists.
 *
 * @throws {UnknownDependencyError}
 */
function assertDependenciesExist(definitions: Definitions): void {
  for (const name of Object.keys(definitions)) {
    for (const dependency of definitions[name]!.dependencies) {
      if (!Object.hasOwn(definitions, dependency)) {
        throw new UnknownDependencyError(dependency, name);
      }
    }
  }
}

/**
 * Depth-first search for cycles. Nodes are coloured `visiting` while on the
 * current path and `done` once fully explored; meeting a `visiting` node
 * means we have walked back onto the path, i.e. a cycle.
 *
 * @throws {CircularDependencyError} with the closed cycle path.
 */
function assertAcyclic(definitions: Definitions): void {
  const done = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  const visit = (name: string): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      throw new CircularDependencyError([...path.slice(start), name]);
    }

    visiting.add(name);
    path.push(name);
    for (const dependency of definitions[name]!.dependencies) {
      visit(dependency);
    }
    path.pop();
    visiting.delete(name);
    done.add(name);
  };

  for (const name of Object.keys(definitions)) {
    visit(name);
  }
}

/**
 * Build an immutable container from a map of definitions.
 *
 * Validation always happens eagerly: an unknown dependency, a cycle or a
 * malformed definition throws from this call. With the default
 * `{ eager: true }` every singleton is also instantiated here, so factory
 * errors surface at startup.
 *
 * @typeParam Defs - Inferred from `definitions`; drives the types returned by
 *   `inject`.
 * @param definitions - A plain object mapping service names to definitions.
 * @param options - See {@link ContainerOptions}.
 * @returns A frozen {@link Container}.
 * @throws {InvalidDefinitionError} if `definitions` is not a plain object, a
 *   key is a reserved name, or a value was not produced by a builder.
 * @throws {UnknownDependencyError} if a declared dependency is not registered.
 * @throws {CircularDependencyError} if the graph contains a cycle.
 *
 * @example
 * ```ts
 * const container = createContainer({
 *   config: asValue({ dsn: 'postgres://...' }),
 *   db: asFunction((config: Config) => connect(config.dsn)).dependsOn('config').singleton(),
 *   users: asClass(UserRepository).dependsOn('db'),
 * });
 *
 * const users = container.inject('users'); // typed as UserRepository
 * ```
 */
export function createContainer<Defs extends Definitions>(
  definitions: Defs,
  options: ContainerOptions = {},
): Container<Defs> {
  const snapshot = snapshotDefinitions(definitions);
  assertDependenciesExist(snapshot);
  assertAcyclic(snapshot);

  const singletons = new Map<string, unknown>();

  const resolve = (name: string): unknown => {
    const definition = snapshot[name]!;

    if (definition.lifetime === 'singleton' && singletons.has(name)) {
      return singletons.get(name);
    }

    // Factory/constructor errors propagate from here unchanged. Because the
    // cache is written only after `build` returns, a failed singleton is
    // retried on the next request rather than cached as `undefined`.
    const instance = definition.build(definition.dependencies.map(resolve));

    if (definition.lifetime === 'singleton') {
      singletons.set(name, instance);
    }
    return instance;
  };

  const serviceNames: readonly ServiceName<Defs>[] = Object.freeze(
    Object.keys(snapshot) as ServiceName<Defs>[],
  );

  if (options.eager !== false) {
    for (const name of serviceNames) {
      if (snapshot[name]!.lifetime === 'singleton') {
        resolve(name);
      }
    }
  }

  const container: Container<Defs> = {
    definitions: snapshot,

    inject<K extends ServiceName<Defs>>(name: K): Resolved<Defs[K]> {
      if (typeof name !== 'string' || !Object.hasOwn(snapshot, name)) {
        throw new UnknownDependencyError(String(name));
      }
      return resolve(name) as Resolved<Defs[K]>;
    },

    has(name: string): name is ServiceName<Defs> {
      return typeof name === 'string' && Object.hasOwn(snapshot, name);
    },

    names(): readonly ServiceName<Defs>[] {
      return serviceNames;
    },
  };

  return Object.freeze(container);
}
