/**
 * Integration test: a small fake application wired entirely through the
 * container.
 *
 *   config ─┐
 *           ├─▶ database (singleton) ─▶ userRepository ─▶ userService ─▶ userRouter
 *   logger ─┘                                                  ▲
 *                                                              └── logger
 */
import { describe, expect, it } from 'vitest';

import { asClass, asFunction, asValue, createContainer } from '../src/index.js';

interface AppConfig {
  readonly dsn: string;
  readonly logLevel: 'debug' | 'info';
}

interface Logger {
  readonly lines: string[];
  info(message: string): void;
}

interface User {
  readonly id: number;
  readonly name: string;
}

class Database {
  static connections = 0;
  readonly rows = new Map<number, User>();

  constructor(
    readonly dsn: string,
    private readonly logger: Logger,
  ) {
    Database.connections += 1;
    this.logger.info(`connected to ${dsn}`);
  }
}

class UserRepository {
  constructor(private readonly db: Database) {}

  save(user: User): void {
    this.db.rows.set(user.id, user);
  }

  findById(id: number): User | undefined {
    return this.db.rows.get(id);
  }

  all(): User[] {
    return [...this.db.rows.values()];
  }
}

class UserService {
  private nextId = 1;

  constructor(
    private readonly users: UserRepository,
    private readonly logger: Logger,
  ) {}

  register(name: string): User {
    if (name.trim().length === 0) {
      throw new RangeError('name must not be empty');
    }
    const user: User = { id: this.nextId++, name };
    this.users.save(user);
    this.logger.info(`registered ${name}`);
    return user;
  }

  get(id: number): User | undefined {
    return this.users.findById(id);
  }
}

interface Request {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
}

interface Response {
  readonly status: number;
  readonly body: unknown;
}

type Router = (request: Request) => Response;

function createUserRouter(service: UserService): Router {
  return (request) => {
    if (request.method === 'POST' && request.path === '/users') {
      const body = request.body as { name?: unknown } | undefined;
      if (typeof body?.name !== 'string') {
        return { status: 400, body: { error: 'name required' } };
      }
      return { status: 201, body: service.register(body.name) };
    }

    const match = /^\/users\/(\d+)$/.exec(request.path);
    if (request.method === 'GET' && match) {
      const user = service.get(Number(match[1]));
      return user ? { status: 200, body: user } : { status: 404, body: { error: 'not found' } };
    }

    return { status: 404, body: { error: 'no route' } };
  };
}

function buildApp(config: AppConfig) {
  return createContainer({
    config: asValue(config),

    logger: asFunction((cfg: AppConfig): Logger => {
      const lines: string[] = [];
      return {
        lines,
        info(message) {
          if (cfg.logLevel === 'debug' || cfg.logLevel === 'info') lines.push(message);
        },
      };
    })
      .dependsOn('config')
      .singleton(),

    database: asFunction((cfg: AppConfig, logger: Logger) => new Database(cfg.dsn, logger))
      .dependsOn('config', 'logger')
      .singleton(),

    userRepository: asClass(UserRepository).dependsOn('database').singleton(),

    userService: asClass(UserService).dependsOn('userRepository', 'logger').singleton(),

    userRouter: asFunction(createUserRouter).dependsOn('userService'),
  });
}

describe('integration: repository -> service -> router', () => {
  it('wires the whole application and serves requests end to end', () => {
    const app = buildApp({ dsn: 'postgres://localhost/test', logLevel: 'info' });
    const router = app.inject('userRouter');

    const created = router({ method: 'POST', path: '/users', body: { name: 'Ada' } });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 1, name: 'Ada' });

    const fetched = router({ method: 'GET', path: '/users/1' });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual({ id: 1, name: 'Ada' });

    expect(router({ method: 'GET', path: '/users/99' }).status).toBe(404);
    expect(router({ method: 'POST', path: '/users', body: {} }).status).toBe(400);
    expect(router({ method: 'GET', path: '/nothing' }).status).toBe(404);
  });

  it('shares singletons across the graph and opens exactly one connection', () => {
    const before = Database.connections;
    const app = buildApp({ dsn: 'postgres://localhost/one', logLevel: 'debug' });

    const routerA = app.inject('userRouter');
    const routerB = app.inject('userRouter');
    expect(routerA).not.toBe(routerB); // router is transient

    routerA({ method: 'POST', path: '/users', body: { name: 'Grace' } });
    const viaB = routerB({ method: 'GET', path: '/users/1' });
    expect(viaB.body).toEqual({ id: 1, name: 'Grace' }); // same service/repo/db underneath

    expect(Database.connections - before).toBe(1);
    expect(app.inject('database')).toBe(app.inject('database'));
    expect(app.inject('userRepository').all()).toHaveLength(1);
  });

  it('eager creation connects the database before the first request', () => {
    const app = buildApp({ dsn: 'postgres://localhost/eager', logLevel: 'info' });
    expect(app.inject('logger').lines).toEqual(['connected to postgres://localhost/eager']);
  });

  it('propagates domain errors from services through the router unchanged', () => {
    const app = buildApp({ dsn: 'postgres://localhost/errors', logLevel: 'info' });
    const router = app.inject('userRouter');
    expect(() => router({ method: 'POST', path: '/users', body: { name: '   ' } })).toThrow(
      RangeError,
    );
  });

  it('exposes the full, typed service list', () => {
    const app = buildApp({ dsn: 'x', logLevel: 'info' });
    expect(app.names()).toEqual([
      'config',
      'logger',
      'database',
      'userRepository',
      'userService',
      'userRouter',
    ]);
  });
});
