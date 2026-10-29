import { describe, expect, it, vi } from 'vitest';

import {
  asClass,
  asFunction,
  asValue,
  CircularDependencyError,
  createContainer,
  DependorError,
  InvalidDefinitionError,
  UnknownDependencyError,
} from '../src/index.js';

class Counter {
  static instances = 0;
  readonly id: number;
  constructor(readonly step: number) {
    Counter.instances += 1;
    this.id = Counter.instances;
  }
}

describe('definitions', () => {
  it('asValue is a singleton with no dependencies', () => {
    const def = asValue(42);
    expect(def.kind).toBe('value');
    expect(def.lifetime).toBe('singleton');
    expect(def.dependencies).toEqual([]);
  });

  it('asFunction and asClass default to transient', () => {
    expect(asFunction(() => 1).lifetime).toBe('transient');
    expect(asClass(Counter).lifetime).toBe('transient');
    expect(asFunction(() => 1).kind).toBe('function');
    expect(asClass(Counter).kind).toBe('class');
  });

  it('builder methods return new frozen definitions and never mutate', () => {
    const base = asFunction(() => 1);
    const withDeps = base.dependsOn('a', 'b');
    const single = withDeps.singleton();
    const transientAgain = single.transient();

    expect(base.dependencies).toEqual([]);
    expect(withDeps.dependencies).toEqual(['a', 'b']);
    expect(single.lifetime).toBe('singleton');
    expect(single.dependencies).toEqual(['a', 'b']);
    expect(transientAgain.lifetime).toBe('transient');

    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(withDeps)).toBe(true);
    expect(Object.isFrozen(withDeps.dependencies)).toBe(true);
    expect(() => {
      (withDeps as { lifetime: string }).lifetime = 'singleton';
    }).toThrow(TypeError);
  });

  it('value definitions reject dependsOn and transient', () => {
    expect(() => asValue(1).dependsOn('x')).toThrow(InvalidDefinitionError);
    expect(() => asValue(1).transient()).toThrow(InvalidDefinitionError);
    expect(asValue(1).singleton().lifetime).toBe('singleton');
  });

  it('asFunction and asClass reject non-functions', () => {
    expect(() => asFunction(123 as unknown as () => number)).toThrow(InvalidDefinitionError);
    expect(() => asFunction(null as unknown as () => number)).toThrow(/received null/);
    expect(() => asClass('nope' as unknown as new () => object)).toThrow(InvalidDefinitionError);
    expect(() => asClass('nope' as unknown as new () => object)).toThrow(/received "nope"/);
  });

  it('dependsOn validates names', () => {
    const def = asFunction(() => 1);
    expect(() => def.dependsOn('')).toThrow(InvalidDefinitionError);
    expect(() => def.dependsOn(123 as unknown as string)).toThrow(/received number/);
    expect(() => def.dependsOn('__proto__')).toThrow(/reserved/);
    expect(() => def.dependsOn('constructor')).toThrow(InvalidDefinitionError);
    expect(() => def.dependsOn('prototype')).toThrow(InvalidDefinitionError);
  });
});

describe('createContainer validation', () => {
  it('rejects non-object definition maps', () => {
    expect(() => createContainer(null as never)).toThrow(InvalidDefinitionError);
    expect(() => createContainer([] as never)).toThrow(InvalidDefinitionError);
    expect(() => createContainer('x' as never)).toThrow(/plain object/);
  });

  it('rejects values that are not real definitions', () => {
    const fake = {
      kind: 'value',
      lifetime: 'singleton',
      dependencies: [],
      build: () => 1,
      dependsOn: () => fake,
      singleton: () => fake,
      transient: () => fake,
    };
    expect(() => createContainer({ fake } as never)).toThrow(
      /must be created with asValue, asFunction or asClass/,
    );
  });

  it('rejects reserved and empty service names', () => {
    const defs = Object.create(null) as Record<string, ReturnType<typeof asValue<number>>>;
    Object.defineProperty(defs, '__proto__', { value: asValue(1), enumerable: true });
    expect(() => createContainer(defs)).toThrow(/reserved/);
    expect(() => createContainer({ constructor: asValue(1) })).toThrow(InvalidDefinitionError);
    expect(() => createContainer({ '': asValue(1) })).toThrow(/non-empty/);
  });

  it('fails fast on unknown dependencies with context', () => {
    let caught: unknown;
    try {
      createContainer({
        service: asFunction((repo: unknown) => repo).dependsOn('missingRepo'),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownDependencyError);
    expect(caught).toBeInstanceOf(DependorError);
    const err = caught as UnknownDependencyError;
    expect(err.dependency).toBe('missingRepo');
    expect(err.requestedBy).toBe('service');
    expect(err.message).toBe('Unknown dependency "missingRepo" (required by "service")');
    expect(err.name).toBe('UnknownDependencyError');
  });

  it('does not treat inherited properties as registered services', () => {
    expect(() =>
      createContainer({
        a: asFunction((x: unknown) => x).dependsOn('toString'),
      }),
    ).toThrow(UnknownDependencyError);
  });
});

describe('circular dependency detection', () => {
  it('detects a direct self-dependency', () => {
    let caught: unknown;
    try {
      createContainer({ a: asFunction((a: unknown) => a).dependsOn('a') });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CircularDependencyError);
    expect((caught as CircularDependencyError).path).toEqual(['a', 'a']);
    expect((caught as CircularDependencyError).message).toBe(
      'Circular dependency detected: a -> a',
    );
  });

  it('detects a multi-node cycle and reports only the cycle', () => {
    let caught: unknown;
    try {
      createContainer({
        root: asFunction((a: unknown) => a).dependsOn('a'),
        a: asFunction((b: unknown) => b).dependsOn('b'),
        b: asFunction((c: unknown) => c).dependsOn('c'),
        c: asFunction((a: unknown) => a).dependsOn('a'),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CircularDependencyError);
    const err = caught as CircularDependencyError;
    expect(err.path).toEqual(['a', 'b', 'c', 'a']);
    expect(err.name).toBe('CircularDependencyError');
    expect(Object.isFrozen(err.path)).toBe(true);
  });

  it('detects cycles regardless of eager setting', () => {
    expect(() =>
      createContainer(
        {
          a: asFunction((b: unknown) => b).dependsOn('b'),
          b: asFunction((a: unknown) => a).dependsOn('a'),
        },
        { eager: false },
      ),
    ).toThrow(CircularDependencyError);
  });

  it('allows diamonds (shared dependencies are not cycles)', () => {
    const container = createContainer({
      leaf: asValue('leaf'),
      left: asFunction((leaf: string) => `L(${leaf})`).dependsOn('leaf'),
      right: asFunction((leaf: string) => `R(${leaf})`).dependsOn('leaf'),
      top: asFunction((l: string, r: string) => `${l}+${r}`).dependsOn('left', 'right'),
    });
    expect(container.inject('top')).toBe('L(leaf)+R(leaf)');
  });
});

describe('lifecycles', () => {
  it('transient builds a new instance per inject', () => {
    const container = createContainer({
      step: asValue(2),
      counter: asClass(Counter).dependsOn('step'),
    });
    const first = container.inject('counter');
    const second = container.inject('counter');
    expect(first).not.toBe(second);
    expect(first.step).toBe(2);
    expect(second.id).toBe(first.id + 1);
  });

  it('singleton caches the instance', () => {
    const factory = vi.fn(() => ({ created: Date.now() }));
    const container = createContainer({
      thing: asFunction(factory).singleton(),
    });
    expect(container.inject('thing')).toBe(container.inject('thing'));
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('singleton dependencies are shared across transient consumers', () => {
    const container = createContainer({
      shared: asClass(Counter).dependsOn('step').singleton(),
      step: asValue(1),
      consumer: asFunction((shared: Counter) => ({ shared })).dependsOn('shared'),
    });
    const a = container.inject('consumer');
    const b = container.inject('consumer');
    expect(a).not.toBe(b);
    expect(a.shared).toBe(b.shared);
  });

  it('asValue returns the same reference every time', () => {
    const config = { port: 3000 };
    const container = createContainer({ config: asValue(config) });
    expect(container.inject('config')).toBe(config);
    expect(container.inject('config')).toBe(container.inject('config'));
  });

  it('eager mode instantiates singletons at creation', () => {
    const factory = vi.fn(() => 'built');
    createContainer({ s: asFunction(factory).singleton() });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('eager mode never instantiates transients at creation', () => {
    const factory = vi.fn(() => 'built');
    createContainer({ t: asFunction(factory) });
    expect(factory).not.toHaveBeenCalled();
  });

  it('lazy mode defers singleton creation until first inject', () => {
    const factory = vi.fn(() => 'built');
    const container = createContainer({ s: asFunction(factory).singleton() }, { eager: false });
    expect(factory).not.toHaveBeenCalled();
    container.inject('s');
    container.inject('s');
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe('factory error propagation', () => {
  class BootError extends Error {}

  it('propagates factory errors unchanged during eager creation', () => {
    const boom = new BootError('db down');
    expect(() =>
      createContainer({
        db: asFunction(() => {
          throw boom;
        }).singleton(),
      }),
    ).toThrow(boom);
  });

  it('propagates constructor errors unchanged from inject', () => {
    class Fragile {
      constructor() {
        throw new BootError('fragile');
      }
    }
    const container = createContainer({ fragile: asClass(Fragile) });
    expect(() => container.inject('fragile')).toThrow(BootError);
    expect(() => container.inject('fragile')).toThrow('fragile');
  });

  it('does not cache a failed singleton and retries on the next inject', () => {
    let attempts = 0;
    const container = createContainer(
      {
        flaky: asFunction(() => {
          attempts += 1;
          if (attempts === 1) throw new BootError('first attempt fails');
          return 'ok';
        }).singleton(),
      },
      { eager: false },
    );
    expect(() => container.inject('flaky')).toThrow(BootError);
    expect(container.inject('flaky')).toBe('ok');
    expect(container.inject('flaky')).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('propagates errors thrown by a transitive dependency', () => {
    const container = createContainer(
      {
        inner: asFunction(() => {
          throw new BootError('inner');
        }),
        outer: asFunction((inner: never) => inner).dependsOn('inner'),
      },
      { eager: false },
    );
    expect(() => container.inject('outer')).toThrow('inner');
  });
});

describe('container surface', () => {
  const container = createContainer({
    a: asValue(1),
    b: asFunction((a: number) => a + 1).dependsOn('a'),
  });

  it('inject throws UnknownDependencyError for unregistered names', () => {
    let caught: unknown;
    try {
      container.inject('nope' as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(UnknownDependencyError);
    expect((caught as UnknownDependencyError).requestedBy).toBeUndefined();
    expect((caught as UnknownDependencyError).message).toBe('Unknown dependency "nope"');
  });

  it('inject rejects non-string names and prototype keys', () => {
    expect(() => container.inject(123 as never)).toThrow(UnknownDependencyError);
    expect(() => container.inject('toString' as never)).toThrow(UnknownDependencyError);
    expect(() => container.inject('__proto__' as never)).toThrow(UnknownDependencyError);
  });

  it('has() and names() reflect registrations', () => {
    expect(container.has('a')).toBe(true);
    expect(container.has('b')).toBe(true);
    expect(container.has('c')).toBe(false);
    expect(container.has('toString')).toBe(false);
    expect(container.has(42 as never)).toBe(false);
    expect(container.names()).toEqual(['a', 'b']);
    expect(Object.isFrozen(container.names())).toBe(true);
  });

  it('is frozen and holds a frozen, prototype-less snapshot of definitions', () => {
    expect(Object.isFrozen(container)).toBe(true);
    expect(Object.isFrozen(container.definitions)).toBe(true);
    expect(Object.getPrototypeOf(container.definitions)).toBeNull();
    expect(() => {
      (container as { inject: unknown }).inject = () => 'hacked';
    }).toThrow(TypeError);
  });

  it('is unaffected by later mutation of the original definitions object', () => {
    const defs: Record<string, ReturnType<typeof asValue<number>>> = { x: asValue(1) };
    const c = createContainer(defs);
    defs['y'] = asValue(2);
    delete defs['x'];
    expect(c.has('x')).toBe(true);
    expect(c.has('y')).toBe(false);
    expect(c.inject('x')).toBe(1);
  });

  it('passes dependencies positionally in dependsOn order', () => {
    const c = createContainer({
      one: asValue(1),
      two: asValue(2),
      sum: asFunction((two: number, one: number) => `${two}-${one}`).dependsOn('two', 'one'),
    });
    expect(c.inject('sum')).toBe('2-1');
  });

  it('allows the same dependency to be injected twice positionally', () => {
    const c = createContainer({
      n: asValue(3),
      square: asFunction((a: number, b: number) => a * b).dependsOn('n', 'n'),
    });
    expect(c.inject('square')).toBe(9);
  });

  it('supports an empty container', () => {
    const empty = createContainer({});
    expect(empty.names()).toEqual([]);
    expect(empty.has('anything')).toBe(false);
  });
});

describe('errors', () => {
  it('all error classes extend DependorError and Error with proper names', () => {
    const errors = [
      new DependorError('base'),
      new InvalidDefinitionError('invalid'),
      new UnknownDependencyError('x'),
      new CircularDependencyError(['a', 'a']),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DependorError);
      expect(error.name).toBe(error.constructor.name);
    }
    expect(new InvalidDefinitionError('invalid').message).toBe('invalid');
    expect(new DependorError('base').message).toBe('base');
  });
});
