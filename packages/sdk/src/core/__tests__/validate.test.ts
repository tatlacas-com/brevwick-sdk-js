import { describe, expect, it } from 'vitest';
import {
  INVALID_CONFIG_CODE,
  PROJECT_KEY_PATTERN,
  validateConfig,
} from '../validate';

const VALID_KEY = 'pk_live_abcdefghijklmnop01';

describe('validateConfig', () => {
  it('accepts a minimal valid config and applies defaults', () => {
    const cfg = validateConfig({ projectKey: VALID_KEY });
    expect(cfg.projectKey).toBe(VALID_KEY);
    expect(cfg.endpoint).toBe('https://api.brevwick.com');
    expect(cfg.enabled).toBe(true);
    expect(cfg.fingerprintOptOut).toBe(false);
    expect(cfg.debug).toBe(false);
    expect(cfg.rings.console).toEqual({
      enabled: true,
      levels: ['log', 'info', 'warn', 'error', 'debug'],
      max: 50,
    });
    expect(cfg.rings.network).toEqual({
      enabled: true,
      captureSuccess: true,
      max: 20,
    });
    expect(cfg.rings.route).toBe(true);
    expect(cfg.redact.disable.size).toBe(0);
    expect(cfg.redact.custom).toEqual([]);
    expect(cfg.environment).toBeUndefined();
    expect(cfg.buildSha).toBeUndefined();
    expect(cfg.release).toBeUndefined();
    expect(cfg.user).toBeUndefined();
    expect(cfg.userContext).toBeUndefined();
  });

  it.each([
    ['non-object', null],
    ['missing projectKey', {}],
    ['wrong projectKey shape', { projectKey: 'bad' }],
    ['short projectKey suffix', { projectKey: 'pk_live_short' }],
    [
      'endpoint not a string',
      { projectKey: VALID_KEY, endpoint: 123 as unknown as string },
    ],
    ['non-https endpoint', { projectKey: VALID_KEY, endpoint: 'http://x.com' }],
    [
      'http with non-loopback subdomain',
      { projectKey: VALID_KEY, endpoint: 'http://api.example.com' },
    ],
    [
      'ftp endpoint',
      { projectKey: VALID_KEY, endpoint: 'ftp://localhost:8080' },
    ],
    ['invalid URL endpoint', { projectKey: VALID_KEY, endpoint: 'not-a-url' }],
    ['bad environment', { projectKey: VALID_KEY, environment: 'production' }],
    ['buildSha not string', { projectKey: VALID_KEY, buildSha: 42 }],
    ['release not string', { projectKey: VALID_KEY, release: true }],
    ['enabled not boolean', { projectKey: VALID_KEY, enabled: 'yes' }],
    [
      'fingerprintOptOut not boolean',
      { projectKey: VALID_KEY, fingerprintOptOut: 1 },
    ],
    ['debug not boolean', { projectKey: VALID_KEY, debug: 'yes' }],
    ['userContext not function', { projectKey: VALID_KEY, userContext: {} }],
    ['user without id', { projectKey: VALID_KEY, user: {} }],
    ['user id not string', { projectKey: VALID_KEY, user: { id: 42 } }],
    ['rings not object', { projectKey: VALID_KEY, rings: true }],
    [
      'rings.console wrong type',
      { projectKey: VALID_KEY, rings: { console: 'on' } },
    ],
    [
      'rings.network wrong type',
      { projectKey: VALID_KEY, rings: { network: 1 } },
    ],
    [
      'rings.route not boolean',
      { projectKey: VALID_KEY, rings: { route: 'off' } },
    ],
    [
      'rings.console.levels with bad level name',
      {
        projectKey: VALID_KEY,
        rings: { console: { levels: ['log', 'trace'] } },
      },
    ],
    [
      'rings.console.max above ceiling',
      { projectKey: VALID_KEY, rings: { console: { max: 500 } } },
    ],
    [
      'rings.network.max above ceiling',
      { projectKey: VALID_KEY, rings: { network: { max: 500 } } },
    ],
    [
      'redact.disable with unknown name',
      { projectKey: VALID_KEY, redact: { disable: ['nope'] } },
    ],
    [
      'redact.custom with non-RegExp entry',
      { projectKey: VALID_KEY, redact: { custom: ['nope'] } },
    ],
  ])('rejects %s with BREVWICK_INVALID_CONFIG', (_label, input) => {
    try {
      validateConfig(input);
      throw new Error('expected validateConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as { code?: string }).code).toBe(INVALID_CONFIG_CODE);
    }
  });

  it('preserves passed ring flags', () => {
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      rings: { console: false, network: true, route: false },
    });
    expect(cfg.rings.console.enabled).toBe(false);
    expect(cfg.rings.network.enabled).toBe(true);
    expect(cfg.rings.network.captureSuccess).toBe(true);
    expect(cfg.rings.route).toBe(false);
  });

  it('accepts the new console object form: levels + max', () => {
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      rings: { console: { levels: ['error'], max: 10 } },
    });
    expect(cfg.rings.console).toEqual({
      enabled: true,
      levels: ['error'],
      max: 10,
    });
  });

  it('accepts the new network object form: captureSuccess=false', () => {
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      rings: { network: { captureSuccess: false } },
    });
    expect(cfg.rings.network).toEqual({
      enabled: true,
      captureSuccess: false,
      max: 20,
    });
  });

  it('accepts redact.disable + redact.custom', () => {
    const re = /secret-\w+/g;
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      redact: {
        disable: ['phone', 'card'],
        custom: [re, { pattern: /xxx/, replacement: '[xxx]' }],
      },
    });
    expect(cfg.redact.disable.has('phone')).toBe(true);
    expect(cfg.redact.disable.has('card')).toBe(true);
    expect(cfg.redact.custom).toHaveLength(2);
    expect(cfg.redact.custom[0]?.pattern).toBe(re);
    expect(cfg.redact.custom[0]?.replacement).toBe('[redacted]');
  });

  it('accepts every valid environment', () => {
    for (const env of ['dev', 'stg', 'prod'] as const) {
      expect(
        validateConfig({ projectKey: VALID_KEY, environment: env }).environment,
      ).toBe(env);
    }
  });

  it('accepts and preserves buildSha / release', () => {
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      buildSha: 'abc123',
      release: '1.2.3',
    });
    expect(cfg.buildSha).toBe('abc123');
    expect(cfg.release).toBe('1.2.3');
  });

  it('accepts a well-formed user object and passes it through untouched', () => {
    const user = { id: 'u_1', email: 'x@example.com', tier: 'pro' };
    const cfg = validateConfig({ projectKey: VALID_KEY, user });
    expect(cfg.user).toEqual(user);
  });

  it('accepts userContext as a function', () => {
    const userContext = (): Record<string, unknown> => ({ a: 1 });
    const cfg = validateConfig({ projectKey: VALID_KEY, userContext });
    expect(cfg.userContext).toBe(userContext);
  });

  it('accepts fingerprintOptOut=true', () => {
    const cfg = validateConfig({
      projectKey: VALID_KEY,
      fingerprintOptOut: true,
    });
    expect(cfg.fingerprintOptOut).toBe(true);
  });

  it('accepts debug=true', () => {
    const cfg = validateConfig({ projectKey: VALID_KEY, debug: true });
    expect(cfg.debug).toBe(true);
  });

  it('accepts enabled=false', () => {
    const cfg = validateConfig({ projectKey: VALID_KEY, enabled: false });
    expect(cfg.enabled).toBe(false);
  });

  // Loopback HTTP is explicitly allowed so integrators can point the SDK at a
  // local Brevwick ingest host without standing up TLS. Every non-loopback http:
  // URL still throws via the rejection table above — this block pins the
  // carve-out. Limited to literal loopback hostnames (`localhost`,
  // `127.0.0.1`, `[::1]`); `*.localhost` aliases are deliberately NOT
  // supported because the extra regex branch would push the eager gzip
  // budget — integrators who need `api.localhost` should use `127.0.0.1`
  // instead or switch to HTTPS.
  it.each([
    ['http://localhost:8080', 'http://localhost:8080'],
    ['http://localhost', 'http://localhost'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['http://[::1]:8080', 'http://[::1]:8080'],
    // Canonicalisation still strips trailing slashes and lowercases the host.
    ['http://LocalHost:8080/', 'http://localhost:8080'],
  ])('accepts loopback http endpoint %s', (endpoint, expected) => {
    const cfg = validateConfig({ projectKey: VALID_KEY, endpoint });
    expect(cfg.endpoint).toBe(expected);
  });

  // Pin the narrower contract: `.localhost` subdomains are NOT accepted.
  it('rejects http://api.localhost (not in the loopback carve-out)', () => {
    try {
      validateConfig({
        projectKey: VALID_KEY,
        endpoint: 'http://api.localhost:8080',
      });
      throw new Error('expected validateConfig to throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe(INVALID_CONFIG_CODE);
    }
  });
});

// `PROJECT_KEY_PATTERN` is exported so adapter packages and example apps
// can gate UI on the same source of truth `validateConfig` enforces.
// These tests pin the contract — if anyone tightens the pattern, the
// failures here force a coordinated update at every consumer that
// imports it.
describe('PROJECT_KEY_PATTERN', () => {
  it.each([
    ['pk_live_abcdefghijklmnop'],
    ['pk_test_abcdefghijklmnop'],
    ['pk_live_ABCDEFGHIJKLMNOP01'],
    ['pk_test_placeholder0000000'], // 24 chars after prefix; matches the example fallback.
  ])('accepts %s', (key) => {
    expect(PROJECT_KEY_PATTERN.test(key)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['placeholder seed', 'pk_test_replace_me'],
    ['wrong prefix', 'sk_live_abcdefghijklmnop'],
    ['wrong env', 'pk_dev_abcdefghijklmnop'],
    ['too short', 'pk_live_short'],
    ['contains hyphen', 'pk_live_abcdefghijk-mnop'],
  ])('rejects %s', (_label, value) => {
    expect(PROJECT_KEY_PATTERN.test(value)).toBe(false);
  });

  it('agrees with validateConfig (single source of truth)', () => {
    // Property-style: any string the regex accepts must be accepted by
    // validateConfig, and vice versa for the rejections sample. If these
    // ever diverge, the regex has stopped being a useful gate and a
    // consumer would render UI that crashes on createBrevwick(...).
    const valid = 'pk_live_abcdefghijklmnop';
    expect(PROJECT_KEY_PATTERN.test(valid)).toBe(true);
    expect(() => validateConfig({ projectKey: valid })).not.toThrow();

    const invalid = 'pk_live_short';
    expect(PROJECT_KEY_PATTERN.test(invalid)).toBe(false);
    expect(() => validateConfig({ projectKey: invalid })).toThrow();
  });
});
