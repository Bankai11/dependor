import { describe, expectTypeOf, it } from 'vitest';

import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  type Container,
  type Definition,
  type Resolved,
  type ServiceName,
} from '../src/index.js';

interface Config {
  readonly dsn: string;
}

class Database {
  constructor(readonly dsn: string) {}
}

class UserRepository {
  constructor(readonly db: Database) {}
}

const definitions = {
  config: asValue<Config>({ dsn: 'postgres://localhost/app' }),
  db: asFunction((config: Config) => new Database(config.dsn)).dependsOn('config').singleton(),
  users: asClass(UserRepository).dependsOn('db'),
  answer: asValue(42),
  greet: asFunction(() => (name: string) => `hi ${name}`),
};

describe('type-level API', () => {
  it('builders infer the produced type', () => {
    expectTypeOf(asValue(1)).toEqualTypeOf<Definition<number>>();
    expectTypeOf(asValue<Config>({ dsn: '' })).toEqualTypeOf<Definition<Config>>();
    expectTypeOf(asFunction(() => 'x')).toEqualTypeOf<Definition<string>>();
    expectTypeOf(asFunction((a: number, b: string) => ({ a, b }))).toEqualTypeOf<
      Definition<{ a: number; b: string }>
    >();
    expectTypeOf(asClass(Database)).toEqualTypeOf<Definition<Database>>();
  });

  it('builder methods preserve the produced type', () => {
    const def = asClass(UserRepository).dependsOn('db').singleton().transient();
    expectTypeOf(def).toEqualTypeOf<Definition<UserRepository>>();
  });

  it('inject is fully typed per service name', () => {
    const container = createContainer(definitions);

    expectTypeOf(container).toEqualTypeOf<Container<typeof definitions>>();
    expectTypeOf(container.inject('config')).toEqualTypeOf<Config>();
    expectTypeOf(container.inject('db')).toEqualTypeOf<Database>();
    expectTypeOf(container.inject('users')).toEqualTypeOf<UserRepository>();
    expectTypeOf(container.inject('answer')).toEqualTypeOf<number>();
    expectTypeOf(container.inject('greet')).toEqualTypeOf<(name: string) => string>();
    expectTypeOf(container.inject('greet')('x')).toEqualTypeOf<string>();
  });

  it('inject rejects unknown service names at compile time', () => {
    const container = createContainer(definitions);
    // @ts-expect-error 'nope' is not a registered service
    container.inject('nope');
    // @ts-expect-error numbers are not service names
    container.inject(1);
  });

  it('inject never returns any', () => {
    const container = createContainer(definitions);
    expectTypeOf(container.inject('users')).not.toBeAny();
    expectTypeOf(container.inject('answer')).not.toBeAny();
  });

  it('has() narrows a string to a registered name', () => {
    const container = createContainer(definitions);
    const key: string = 'db';
    if (container.has(key)) {
      expectTypeOf(key).toEqualTypeOf<ServiceName<typeof definitions>>();
      expectTypeOf(container.inject(key)).toEqualTypeOf<
        Config | Database | UserRepository | number | ((name: string) => string)
      >();
    }
  });

  it('names() returns the literal union of registered names', () => {
    const container = createContainer(definitions);
    expectTypeOf(container.names()).toEqualTypeOf<
      readonly ('config' | 'db' | 'users' | 'answer' | 'greet')[]
    >();
  });

  it('Resolved unwraps a definition and ServiceName extracts keys', () => {
    expectTypeOf<Resolved<Definition<Database>>>().toEqualTypeOf<Database>();
    expectTypeOf<Resolved<string>>().toEqualTypeOf<never>();
    expectTypeOf<ServiceName<typeof definitions>>().toEqualTypeOf<
      'config' | 'db' | 'users' | 'answer' | 'greet'
    >();
  });

  it('definitions snapshot keeps the original literal types', () => {
    const container = createContainer(definitions);
    expectTypeOf(container.definitions.users).toEqualTypeOf<Definition<UserRepository>>();
  });

  it('createContainer rejects non-definition values at compile time', () => {
    // @ts-expect-error plain values are not definitions
    createContainer({ bad: 1 });
    // @ts-expect-error arrays are not definition maps
    createContainer([asValue(1)]);
  });
});
