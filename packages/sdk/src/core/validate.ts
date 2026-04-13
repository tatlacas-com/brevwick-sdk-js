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
const VALID_ENVIRONMENTS = ['dev', 'stg', 'prod'] as const satisfies readonly Environment[];

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

function assertHttpsUrl(value: string, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BrevwickConfigError(`${field} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new BrevwickConfigError(`${field} must use https`);
  }
}

function isEnvironment(value: unknown): value is Environment {
  return (
    typeof value === 'string' &&
    (VALID_ENVIRONMENTS as readonly string[]).includes(value)
  );
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

  let endpoint: string = DEFAULT_ENDPOINT;
  if (input.endpoint !== undefined) {
    if (typeof input.endpoint !== 'string') {
      throw new BrevwickConfigError('endpoint must be a string');
    }
    endpoint = input.endpoint;
  }
  assertHttpsUrl(endpoint, 'endpoint');

  let environment: Environment | undefined;
  if (input.environment !== undefined) {
    if (!isEnvironment(input.environment)) {
      throw new BrevwickConfigError(
        `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      );
    }
    environment = input.environment;
  }

  let buildSha: string | undefined;
  if (input.buildSha !== undefined) {
    if (typeof input.buildSha !== 'string') {
      throw new BrevwickConfigError('buildSha must be a string');
    }
    buildSha = input.buildSha;
  }

  let release: string | undefined;
  if (input.release !== undefined) {
    if (typeof input.release !== 'string') {
      throw new BrevwickConfigError('release must be a string');
    }
    release = input.release;
  }

  let enabled = true;
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') {
      throw new BrevwickConfigError('enabled must be a boolean');
    }
    enabled = input.enabled;
  }

  let fingerprintOptOut = false;
  if (input.fingerprintOptOut !== undefined) {
    if (typeof input.fingerprintOptOut !== 'boolean') {
      throw new BrevwickConfigError('fingerprintOptOut must be a boolean');
    }
    fingerprintOptOut = input.fingerprintOptOut;
  }

  let userContext: BrevwickConfig['userContext'];
  if (input.userContext !== undefined) {
    if (typeof input.userContext !== 'function') {
      throw new BrevwickConfigError('userContext must be a function');
    }
    userContext = input.userContext as BrevwickConfig['userContext'];
  }

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
