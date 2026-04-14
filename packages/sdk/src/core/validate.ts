import type { BrevwickConfig, Environment } from '../types';

export const INVALID_CONFIG_CODE = 'BREVWICK_INVALID_CONFIG';

export class BrevwickConfigError extends Error {
  readonly code = INVALID_CONFIG_CODE;
  constructor(message: string) {
    super(message);
    this.name = 'BrevwickConfigError';
  }
}

const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const DEFAULT_ENDPOINT = 'https://api.brevwick.com';
const VALID_ENVIRONMENTS = [
  'dev',
  'stg',
  'prod',
] as const satisfies readonly Environment[];

export interface ValidatedConfig extends Required<
  Pick<BrevwickConfig, 'projectKey' | 'endpoint'>
> {
  enabled: boolean;
  fingerprintOptOut: boolean;
  rings: { console: boolean; network: boolean; route: boolean };
  environment?: Environment;
  buildSha?: string;
  release?: string;
  userContext?: BrevwickConfig['userContext'];
  user?: BrevwickConfig['user'];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse + canonicalise so `https://api.brevwick.com` and
 * `https://API.Brevwick.com/` collapse to the same singleton key. Without
 * this, a typo in config on the second `createBrevwick` call spawns a
 * shadow instance that silently diverges from the first. `http:` is allowed
 * only on loopback (`localhost`, `127.0.0.1`, `[::1]`) so integrators can
 * point at a local `brevwick-api` without standing up TLS; the `URL` parser
 * lowercases `hostname`/`host` for us. Three inline equality checks beat a
 * regex by a few gzipped bytes — deliberate, see SDD § 12 bundle budget.
 * `.localhost` aliases are NOT accepted; use `127.0.0.1` instead.
 */
function canonicaliseHttpsUrl(value: string, field: string): string {
  let p: URL;
  try {
    p = new URL(value);
  } catch {
    throw new BrevwickConfigError(`${field} must be a valid URL`);
  }
  const proto = p.protocol;
  const h = p.hostname;
  if (
    proto !== 'https:' &&
    !(
      proto === 'http:' &&
      (h === 'localhost' || h === '127.0.0.1' || h === '[::1]')
    )
  ) {
    throw new BrevwickConfigError(`${field} must use https`);
  }
  return `${proto}//${p.host}${p.pathname.replace(/\/+$/, '')}${p.search}`;
}

function isEnvironment(value: unknown): value is Environment {
  return (
    typeof value === 'string' &&
    (VALID_ENVIRONMENTS as readonly string[]).includes(value)
  );
}

/**
 * Typed field extractor that enforces runtime type on any optional config
 * field in one place. Collapses the previous ~8 repeated `if (input.x !==
 * undefined) { if (typeof x !== '…') throw }` blocks — both a readability
 * win and the difference between the eager bundle sitting at ~2.0 kB vs
 * ~2.1 kB gzipped.
 */
function expect<T>(
  obj: Record<string, unknown>,
  field: string,
  type: 'string' | 'boolean' | 'function',
  defaultValue?: T,
): T | undefined {
  const v = obj[field];
  if (v === undefined) return defaultValue;
  if (typeof v !== type) {
    throw new BrevwickConfigError(`${field} must be a ${type}`);
  }
  return v as T;
}

export function validateConfig(input: unknown): ValidatedConfig {
  if (!isPlainObject(input)) {
    throw new BrevwickConfigError('config must be an object');
  }

  const projectKey = input.projectKey;
  if (typeof projectKey !== 'string' || !PROJECT_KEY_PATTERN.test(projectKey)) {
    throw new BrevwickConfigError(
      'projectKey must match /^pk_(live|test)_[A-Za-z0-9]{16,}$/',
    );
  }

  const rawEndpoint = expect<string>(
    input,
    'endpoint',
    'string',
    DEFAULT_ENDPOINT,
  )!;
  const endpoint = canonicaliseHttpsUrl(rawEndpoint, 'endpoint');

  let environment: Environment | undefined;
  if (input.environment !== undefined) {
    if (!isEnvironment(input.environment)) {
      throw new BrevwickConfigError(
        `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      );
    }
    environment = input.environment;
  }

  const buildSha = expect<string>(input, 'buildSha', 'string');
  const release = expect<string>(input, 'release', 'string');
  const enabled = expect<boolean>(input, 'enabled', 'boolean', true)!;
  const fingerprintOptOut = expect<boolean>(
    input,
    'fingerprintOptOut',
    'boolean',
    false,
  )!;
  const userContext = expect<BrevwickConfig['userContext']>(
    input,
    'userContext',
    'function',
  );

  let user: BrevwickConfig['user'];
  if (input.user !== undefined) {
    if (!isPlainObject(input.user) || typeof input.user.id !== 'string') {
      throw new BrevwickConfigError('user must be an object with a string id');
    }
    user = input.user as BrevwickConfig['user'];
  }

  const rawRings = input.rings;
  if (rawRings !== undefined && !isPlainObject(rawRings)) {
    throw new BrevwickConfigError('rings must be an object');
  }
  const ringsIn = (rawRings ?? {}) as Record<string, unknown>;
  const rings: ValidatedConfig['rings'] = {
    console: true,
    network: true,
    route: true,
  };
  for (const key of ['console', 'network', 'route'] as const) {
    const value = ringsIn[key];
    if (value !== undefined) {
      if (typeof value !== 'boolean') {
        throw new BrevwickConfigError(`rings.${key} must be a boolean`);
      }
      rings[key] = value;
    }
  }

  return {
    projectKey,
    endpoint,
    enabled,
    fingerprintOptOut,
    rings,
    environment,
    buildSha,
    release,
    userContext,
    user,
  };
}
