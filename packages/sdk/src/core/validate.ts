import type {
  BrevwickConfig,
  ConsoleLevel,
  Environment,
  RedactCustomPattern,
  RedactPatternName,
} from '../types';

export const INVALID_CONFIG_CODE = 'BREVWICK_INVALID_CONFIG';

export class BrevwickConfigError extends Error {
  readonly code = INVALID_CONFIG_CODE;
  constructor(message: string) {
    super(message);
    this.name = 'BrevwickConfigError';
  }
}

/**
 * Public regex that gates accepted `projectKey` strings — exported so adapter
 * packages and example apps can validate user-supplied keys before constructing
 * a `Brevwick` instance, without duplicating (and risking drift from) the
 * single source of truth used by {@link validateConfig}. The pattern accepts
 * `pk_live_…` or `pk_test_…` followed by 16+ alphanumeric characters; tighten
 * here and every consumer picks up the change automatically.
 *
 * The regex is the only export — a `boolean`-returning helper would have
 * cost ~25 B gzipped on the eager path, and `PROJECT_KEY_PATTERN.test(value)`
 * is a one-line call for consumers anyway.
 */
export const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const DEFAULT_ENDPOINT = 'https://api.brevwick.com';
const VALID_ENVIRONMENTS = [
  'dev',
  'stg',
  'prod',
] as const satisfies readonly Environment[];

export interface ValidatedConsoleRing {
  enabled: boolean;
  levels: readonly ConsoleLevel[];
  max: number;
}

export interface ValidatedNetworkRing {
  enabled: boolean;
  captureSuccess: boolean;
  max: number;
}

export interface ValidatedRedact {
  disable: ReadonlySet<RedactPatternName>;
  custom: readonly RedactCustomPattern[];
}

export interface ValidatedConfig extends Required<
  Pick<BrevwickConfig, 'projectKey' | 'endpoint'>
> {
  enabled: boolean;
  fingerprintOptOut: boolean;
  /** Dev-only: retain + expose the composed payload on each SubmitResult. Default false. */
  debug: boolean;
  rings: {
    console: ValidatedConsoleRing;
    network: ValidatedNetworkRing;
    route: boolean;
  };
  redact: ValidatedRedact;
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
 * point at a local Brevwick ingest host without standing up TLS; the `URL` parser
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
  const debug = expect<boolean>(input, 'debug', 'boolean', false)!;
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
    console: parseConsoleRing(ringsIn.console),
    network: parseNetworkRing(ringsIn.network),
    route: parseBooleanRing(ringsIn.route, 'route'),
  };

  const redact = parseRedact(input.redact);

  return {
    projectKey,
    endpoint,
    enabled,
    fingerprintOptOut,
    debug,
    rings,
    redact,
    environment,
    buildSha,
    release,
    userContext,
    user,
  };
}

const CONSOLE_LEVELS: readonly ConsoleLevel[] = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
];

const REDACT_PATTERN_NAMES: readonly RedactPatternName[] = [
  'auth',
  'cookie',
  'bearer',
  'jwt',
  'email',
  'card',
  'ip',
  'ssn',
  'phone',
  'aws',
  'github',
  'base64',
];

function parseBooleanRing(value: unknown, key: string): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') {
    throw new BrevwickConfigError(`rings.${key} must be a boolean`);
  }
  return value;
}

/**
 * Shared scaffold for the console / network ring config parsers. Accepts the
 * boolean shorthand or the object form; rejects everything else with a
 * uniform error. Defaults + per-ring extras are filled in by the caller via
 * the `extras` callback.
 */
function parseRingConfig<T extends { enabled: boolean; max: number }>(
  value: unknown,
  field: string,
  defaults: T,
  ceiling: number,
  extras: (raw: Record<string, unknown>, base: T) => T,
): T {
  if (value === undefined || value === true) return { ...defaults };
  if (value === false) return { ...defaults, enabled: false };
  if (!isPlainObject(value)) {
    throw new BrevwickConfigError(`${field} must be a boolean or object`);
  }
  const max = parseRingMax(value.max, `${field}.max`, defaults.max, ceiling);
  return extras(value, { ...defaults, max });
}

function parseConsoleRing(value: unknown): ValidatedConsoleRing {
  return parseRingConfig<ValidatedConsoleRing>(
    value,
    'rings.console',
    { enabled: true, levels: CONSOLE_LEVELS, max: 50 },
    200,
    (raw, base) => {
      if (raw.levels === undefined) return base;
      if (!Array.isArray(raw.levels)) {
        throw new BrevwickConfigError('rings.console.levels must be an array');
      }
      for (const level of raw.levels) {
        if (!CONSOLE_LEVELS.includes(level as ConsoleLevel)) {
          throw new BrevwickConfigError(
            `rings.console.levels must be one of ${CONSOLE_LEVELS.join(', ')}`,
          );
        }
      }
      // Defensive copy: the public type marks `levels` as `readonly`, but
      // `readonly` is erased at runtime — without a snapshot a consumer who
      // later mutates the array they passed in would silently change the
      // ring's filter set. Cheap (≤ 5 entries) and one-shot at validation.
      return {
        ...base,
        levels: [...(raw.levels as ConsoleLevel[])] as readonly ConsoleLevel[],
      };
    },
  );
}

function parseNetworkRing(value: unknown): ValidatedNetworkRing {
  return parseRingConfig<ValidatedNetworkRing>(
    value,
    'rings.network',
    { enabled: true, captureSuccess: true, max: 20 },
    100,
    (raw, base) => {
      if (raw.captureSuccess === undefined) return base;
      if (typeof raw.captureSuccess !== 'boolean') {
        throw new BrevwickConfigError(
          'rings.network.captureSuccess must be a boolean',
        );
      }
      return { ...base, captureSuccess: raw.captureSuccess };
    },
  );
}

function parseRingMax(
  raw: unknown,
  field: string,
  fallback: number,
  ceiling: number,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new BrevwickConfigError(`${field} must be a positive integer`);
  }
  if (raw > ceiling) {
    throw new BrevwickConfigError(`${field} must be ≤ ${ceiling}`);
  }
  return raw;
}

function parseRedact(value: unknown): ValidatedRedact {
  if (value === undefined) return { disable: new Set(), custom: [] };
  if (!isPlainObject(value)) {
    throw new BrevwickConfigError('redact must be an object');
  }
  const disable = new Set<RedactPatternName>();
  if (value.disable !== undefined) {
    if (!Array.isArray(value.disable)) {
      throw new BrevwickConfigError('redact.disable must be an array');
    }
    for (const name of value.disable) {
      if (!REDACT_PATTERN_NAMES.includes(name as RedactPatternName)) {
        throw new BrevwickConfigError(
          `redact.disable entries must be one of ${REDACT_PATTERN_NAMES.join(', ')}`,
        );
      }
      disable.add(name as RedactPatternName);
    }
  }
  const custom: RedactCustomPattern[] = [];
  if (value.custom !== undefined) {
    if (!Array.isArray(value.custom)) {
      throw new BrevwickConfigError('redact.custom must be an array');
    }
    for (const entry of value.custom) {
      if (entry instanceof RegExp) {
        custom.push({ pattern: entry, replacement: '[redacted]' });
        continue;
      }
      if (
        isPlainObject(entry) &&
        entry.pattern instanceof RegExp &&
        typeof entry.replacement === 'string'
      ) {
        custom.push({
          pattern: entry.pattern,
          replacement: entry.replacement,
        });
        continue;
      }
      throw new BrevwickConfigError(
        'redact.custom entries must be RegExp or { pattern, replacement }',
      );
    }
  }
  return { disable, custom };
}
