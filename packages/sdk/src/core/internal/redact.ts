/**
 * Client-side redaction. Mirrors the server-side ingest sanitiser; we
 * redact early so secrets never even leave the device.
 *
 * Consumed internally by the submit pipeline + the console / network rings.
 * Not re-exported on the public surface — callers tune behaviour via
 * `BrevwickConfig.redact` (`disable[]` / `custom[]`).
 *
 * Built-in patterns (run in order):
 * - `auth`   — Authorization headers
 * - `cookie` — Cookie / Set-Cookie headers
 * - `bearer` — `Bearer <token>` (header value form)
 * - `jwt`    — JWT-shaped strings (must start with `eyJ`)
 * - `email`  — Email addresses
 * - `card`   — 13-19-digit credit-card numbers, Luhn-checked
 * - `ip`     — IPv4 / IPv6 literals
 * - `ssn`    — US SSN / UK NI numbers
 * - `phone`  — E.164-shaped phone numbers (8-15 digit length sanity check)
 * - `aws`    — AWS access-key IDs (`AKIA…`)
 * - `github` — GitHub tokens (`ghp_` / `gho_` / `ghs_` prefixes)
 * - `base64` — Long base64 blobs (≥200 chars)
 */
import type { RedactCustomPattern, RedactPatternName } from '../../types';

interface NamedPattern {
  name: RedactPatternName;
  pattern: RegExp;
  replacement: string;
}

interface RuntimePattern {
  pattern: RegExp;
  replacement: string;
  /** When set, redact() runs `match`-level extra validation before replacing. */
  guard?: 'card' | 'phone';
}

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// IPv6 — order alternatives most-specific-first so the regex engine does not
// match a prefix-only fragment when a longer form is available. The shape
// rule that disambiguates "real IPv6 literal" from "incidental colon-
// separated text" (HH:MM:SS times, `host:port:variant` traces, version
// triples like `a:b:c`): a real address must contain EITHER a literal `::`
// (compressed form) OR at least one hex letter `a-fA-F` (full form). Pure
// decimal full-form IPv6 like `1:2:3:4:5:6:7:8` is technically valid but
// vanishingly rare in real telemetry — the false-positive cost of
// shredding HH:MM:SS / port lists / abc:def:ghi traces dominates, so the
// regex deliberately does not match it. Branches:
//   1. `::ffff:<ipv4>` — IPv4-mapped (must come before the generic `::`
//      branch so the ipv4 tail is masked atomically with the prefix).
//   2. Compressed form with literal `::` — covers `2001:db8:0:1::abcd`,
//      `fe80::1`, `fe80::1%eth0`, `fc00::1`, and `::1` loopback. Boundary
//      is `(?<![A-Za-z0-9:])` / `(?![0-9a-fA-F])` so the match cannot
//      bleed across an adjacent hex run.
//   3. Full uncompressed 8-group form gated on a hex-letter lookahead so
//      `1:2:3:4:5:6:7:8` (no `::`, no hex letter) does NOT match — only
//      shapes like `2001:db8:0:1:abcd:ef01:2345:6789` get redacted.
const IPV6 =
  /(?<![A-Za-z0-9])::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|(?<![A-Za-z0-9:])(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?(?:%[0-9a-zA-Z]+)?(?![0-9a-fA-F])|(?<![A-Za-z0-9:])(?=[0-9a-fA-F:]{1,40}[a-fA-F])[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7}(?![0-9a-fA-F])/g;

const BUILTIN: readonly NamedPattern[] = [
  {
    name: 'auth',
    pattern: /Authorization:[^\n\r]+/gi,
    replacement: 'Authorization: [redacted]',
  },
  {
    name: 'cookie',
    pattern: /(Set-)?Cookie:[^\n\r]+/gi,
    replacement: '$1Cookie: [redacted]',
  },
  {
    name: 'bearer',
    pattern: /Bearer\s+[A-Za-z0-9._\-+/=]+/g,
    replacement: 'Bearer [redacted]',
  },
  {
    name: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '[jwt]',
  },
  {
    name: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: '[email]',
  },
  // Card runs first among numeric patterns so a Luhn-pass run isn't
  // shredded by the phone matcher. The replacement is computed dynamically
  // (see runCardPattern) — only Luhn-pass runs are masked.
  {
    name: 'card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: '[card]',
  },
  // IPv6 must run before IPv4 so the `::ffff:1.2.3.4` mapped form is masked
  // as a single `[ip]` token. Otherwise IPv4 strips the `1.2.3.4` tail first
  // and the generic IPv6 branch is left masking the orphan `::ffff` prefix.
  { name: 'ip', pattern: IPV6, replacement: '[ip]' },
  { name: 'ip', pattern: IPV4, replacement: '[ip]' },
  // US SSN: `\d{3}-\d{2}-\d{4}` and UK NI: two letters + 6 digits + final A-D.
  {
    name: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[ssn]',
  },
  {
    name: 'ssn',
    pattern:
      /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g,
    replacement: '[ssn]',
  },
  {
    name: 'phone',
    pattern: /\+?\d[\d\s\-()]{7,}\d/g,
    replacement: '[phone]',
  },
  { name: 'aws', pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[aws-key]' },
  {
    name: 'github',
    pattern: /\bgh[posu]_[A-Za-z0-9]{36,}\b/g,
    replacement: '[gh-token]',
  },
  {
    name: 'base64',
    pattern: /[A-Za-z0-9+/]{200,}={0,2}/g,
    replacement: '[blob]',
  },
];

/**
 * Standard Luhn / mod-10 checksum. Walks the digit string right-to-left,
 * doubles every other digit (starting from the second-to-last), and sums
 * the doubled-then-digit-summed value plus the rest. Returns true when the
 * sum is divisible by 10.
 */
function luhn(input: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = input.length - 1; i >= 0; i--) {
    const code = input.charCodeAt(i);
    if (code < 48 || code > 57) continue;
    let n = code - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}

/** Strip non-digits and check 8-15 length. Used by the phone matcher. */
function isPhoneLike(raw: string): boolean {
  let count = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c >= 48 && c <= 57) count++;
  }
  return count >= 8 && count <= 15;
}

/**
 * Build the runtime pattern list from a config. Custom patterns append after
 * built-ins so a user pattern can mask something a built-in left alone — the
 * sequential `String.prototype.replace` loop in {@link redact} preserves that
 * order.
 */
function buildPatterns(
  disable: ReadonlySet<RedactPatternName>,
  custom: readonly RedactCustomPattern[],
): readonly RuntimePattern[] {
  const out: RuntimePattern[] = [];
  for (const p of BUILTIN) {
    if (disable.has(p.name)) continue;
    const guard =
      p.name === 'card' ? 'card' : p.name === 'phone' ? 'phone' : undefined;
    out.push({ pattern: p.pattern, replacement: p.replacement, guard });
  }
  for (const c of custom)
    out.push({ pattern: c.pattern, replacement: c.replacement });
  return out;
}

const DEFAULT_PATTERNS = buildPatterns(new Set(), []);

/**
 * C0 control characters that must never ride out on the wire, minus the three
 * whitespace controls a captured text body legitimately contains (`\t`, `\n`,
 * `\r`) plus DEL (U+007F). The critical one is **NUL (U+0000)**: Postgres
 * rejects U+0000 in `text` and `jsonb` columns, so a single NUL in a captured
 * console line or network response body fails the server-side `INSERT` and
 * 500s the whole submission. These bytes show up when a ring reads a binary
 * payload as text (e.g. a WOFF2 font served with a non-binary content-type).
 * Stripping them here — at the mandatory redaction chokepoint every ring and
 * the submit pipeline pass through — guarantees no payload leaves the device
 * carrying one, regardless of which ring captured it.
 */
// eslint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface Redactor {
  (input: string): string;
}

/**
 * Build a redactor closed over a config. Cards get a Luhn gate applied
 * post-replace (only Luhn-pass runs are masked) and phone matches get a
 * digit-count sanity check (8-15 digits) so an order-number-shaped string
 * doesn't get redacted as a phone.
 */
export function createRedactor(
  disable: ReadonlySet<RedactPatternName> = new Set(),
  custom: readonly RedactCustomPattern[] = [],
): Redactor {
  const patterns =
    disable.size === 0 && custom.length === 0
      ? DEFAULT_PATTERNS
      : buildPatterns(disable, custom);
  return (input: string): string => {
    let out = input;
    for (const { pattern, replacement, guard } of patterns) {
      if (guard === 'card') {
        out = out.replace(pattern, (match) => {
          const digits = match.replace(/\D/g, '');
          if (digits.length < 13 || digits.length > 19) return match;
          return luhn(digits) ? replacement : match;
        });
        continue;
      }
      if (guard === 'phone') {
        out = out.replace(pattern, (match) =>
          isPhoneLike(match) ? replacement : match,
        );
        continue;
      }
      out = out.replace(pattern, replacement);
    }
    // Final, unconditional pass: drop control chars (NUL et al.) that a ring
    // may have captured from a binary body read as text. Runs after the
    // redaction patterns and is not gated by `disable`/`custom` — a NUL on
    // the wire is a correctness bug (server-side INSERT 500), not a
    // tunable redaction preference.
    return out.replace(CONTROL_CHARS, '');
  };
}

const defaultRedactor = createRedactor();

/**
 * Module-level default redactor. Kept as a top-level export for callers that
 * do not need per-instance config — `submit.ts` and the rings inject a
 * configured redactor at install time, but module-level callers (and the
 * test suite for redact itself) use this default.
 *
 * Re-exported on the public surface (`@tatlacas/brevwick-sdk`) so adapter
 * packages (e.g. `@tatlacas/brevwick-react-native`) can run the same global
 * sweep over text they emit before pushing into a ring. This is the
 * "every payload that leaves the device runs through `redact()` first"
 * contract from CLAUDE.md.
 */
export function redact(input: string): string {
  return defaultRedactor(input);
}

/**
 * Shared sensitive-parameter key matcher. Names that match this regex are
 * considered too risky to ship on the wire as keys in a query/param string;
 * the value is replaced with a marker rather than serialised. Used by:
 *
 *  - `packages/sdk/src/rings/network.ts` — strips matching `URLSearchParams`
 *    keys from captured URLs.
 *  - `packages/react-native/src/rings/route.ts` — masks matching React
 *    Navigation route param keys before serialising them into the route
 *    `path`.
 *
 * Centralising the regex here keeps both rings in lockstep — historically
 * the two had drifted with two parallel definitions of "what counts as
 * sensitive". Re-exported on the public SDK surface so adapter packages
 * import the source-of-truth instead of redefining it.
 */
export const SENSITIVE_PARAM_KEYS: RegExp = /^(token|auth|key|session|sig).*/i;

export function redactValue<T>(
  value: T,
  redactor: Redactor = defaultRedactor,
): T {
  if (typeof value === 'string') return redactor(value) as T;
  if (Array.isArray(value))
    return value.map((v) => redactValue(v, redactor)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, redactor);
    }
    return out as T;
  }
  return value;
}
