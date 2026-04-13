import type { BrevwickConfig } from '../types';

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
const VALID_ENVIRONMENTS = ['dev', 'stg', 'prod'] as const;

export interface ValidatedConfig extends Required<
  Pick<BrevwickConfig, 'projectKey' | 'endpoint'>
> {
  enabled: boolean;
  fingerprintOptOut: boolean;
  rings: { console: boolean; network: boolean; route: boolean };
  environment?: BrevwickConfig['environment'];
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

  const endpoint = input.endpoint ?? DEFAULT_ENDPOINT;
  if (typeof endpoint !== 'string') {
    throw new BrevwickConfigError('endpoint must be a string');
  }
  assertHttpsUrl(endpoint, 'endpoint');

  if (input.environment !== undefined) {
    if (
      typeof input.environment !== 'string' ||
      !VALID_ENVIRONMENTS.includes(
        input.environment as (typeof VALID_ENVIRONMENTS)[number],
      )
    ) {
      throw new BrevwickConfigError(
        `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      );
    }
  }

  if (input.buildSha !== undefined && typeof input.buildSha !== 'string') {
    throw new BrevwickConfigError('buildSha must be a string');
  }

  if (input.release !== undefined && typeof input.release !== 'string') {
    throw new BrevwickConfigError('release must be a string');
  }

  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new BrevwickConfigError('enabled must be a boolean');
  }

  if (
    input.fingerprintOptOut !== undefined &&
    typeof input.fingerprintOptOut !== 'boolean'
  ) {
    throw new BrevwickConfigError('fingerprintOptOut must be a boolean');
  }

  if (
    input.userContext !== undefined &&
    typeof input.userContext !== 'function'
  ) {
    throw new BrevwickConfigError('userContext must be a function');
  }

  if (input.user !== undefined) {
    if (!isPlainObject(input.user) || typeof input.user.id !== 'string') {
      throw new BrevwickConfigError('user must be an object with a string id');
    }
  }

  const rawRings = input.rings;
  if (rawRings !== undefined && !isPlainObject(rawRings)) {
    throw new BrevwickConfigError('rings must be an object');
  }
  const ringsIn = (rawRings ?? {}) as Record<string, unknown>;
  for (const key of ['console', 'network', 'route'] as const) {
    if (ringsIn[key] !== undefined && typeof ringsIn[key] !== 'boolean') {
      throw new BrevwickConfigError(`rings.${key} must be a boolean`);
    }
  }

  return {
    projectKey,
    endpoint,
    enabled: (input.enabled as boolean | undefined) ?? true,
    fingerprintOptOut:
      (input.fingerprintOptOut as boolean | undefined) ?? false,
    rings: {
      console: (ringsIn.console as boolean | undefined) ?? true,
      network: (ringsIn.network as boolean | undefined) ?? true,
      route: (ringsIn.route as boolean | undefined) ?? true,
    },
    environment: input.environment as BrevwickConfig['environment'],
    buildSha: input.buildSha as string | undefined,
    release: input.release as string | undefined,
    userContext: input.userContext as BrevwickConfig['userContext'],
    user: input.user as BrevwickConfig['user'],
  };
}
