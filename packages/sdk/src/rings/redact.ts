/**
 * Client-side redaction. Mirrors the server-side sanitiser in brevwick-api;
 * we redact early so secrets never even leave the device.
 *
 * Patterns:
 * - Authorization / Cookie / Set-Cookie headers
 * - `Bearer <token>`
 * - JWT-shaped strings
 * - Email addresses
 * - Long base64 blobs (>200 chars)
 */

const PATTERNS: Array<[RegExp, string]> = [
  [/Authorization:[^\n\r]+/gi, 'Authorization: [redacted]'],
  [/(Set-)?Cookie:[^\n\r]+/gi, '$1Cookie: [redacted]'],
  [/Bearer\s+[A-Za-z0-9._\-+/=]+/g, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/[A-Za-z0-9+/]{200,}={0,2}/g, '[blob]'],
];

export function redact(input: string): string {
  let out = input;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactValue) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v);
    }
    return out as T;
  }
  return value;
}
