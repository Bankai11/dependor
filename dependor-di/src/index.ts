/**
 * dependor: a tiny, zero-dependency, type-safe dependency injection container
 * for Node.js and TypeScript.
 *
 * @example
 * ```ts
 * import { asClass, asFunction, asValue, createContainer } from '@bankai11/dependor';
 *
 * const container = createContainer({
 *   config: asValue({ greeting: 'hello' }),
 *   greeter: asFunction((config: { greeting: string }) => (name: string) => `${config.greeting} ${name}`)
 *     .dependsOn('config')
 *     .singleton(),
 * });
 *
 * container.inject('greeter')('world'); // "hello world"
 * ```
 *
 * @packageDocumentation
 */

export { createContainer } from './container.js';
export { asClass, asFunction, asValue } from './definitions.js';
export {
  CircularDependencyError,
  DependorError,
  InvalidDefinitionError,
  UnknownDependencyError,
} from './errors.js';
export type {
  Constructor,
  Container,
  ContainerOptions,
  Definition,
  DefinitionKind,
  Definitions,
  Factory,
  Lifetime,
  Resolved,
  ServiceName,
} from './types.js';
