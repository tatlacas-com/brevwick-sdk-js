import { describe, expect, it } from 'vitest';
import { createRedactor, redact, redactValue } from '../redact';

describe('redact (default)', () => {
  it('strips Authorization headers', () => {
    expect(redact('Authorization: Bearer abc.def.ghi')).not.toMatch(/abc\.def/);
  });

  it('strips Cookie headers', () => {
    expect(redact('Cookie: sid=123; theme=dark')).toContain('[redacted]');
  });

  it('replaces JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturepart_with_more_chars_here';
    expect(redact(jwt)).toBe('[jwt]');
  });

  it('replaces email addresses', () => {
    expect(redact('contact john.doe@example.com today')).toBe(
      'contact [email] today',
    );
  });

  it('replaces long base64 blobs', () => {
    const blob = 'A'.repeat(220);
    expect(redact(blob)).toBe('[blob]');
  });

  it('leaves harmless text alone', () => {
    expect(redact('the modal hangs on second open')).toBe(
      'the modal hangs on second open',
    );
  });

  it('redacts a Luhn-pass card number, leaves a Luhn-fail run alone', () => {
    expect(redact('pan: 4242 4242 4242 4242')).toBe('pan: [card]');
    // Luhn-fail: 1234 5678 9012 3456 → checksum 64 → not divisible by 10.
    expect(redact('order: 1234 5678 9012 3456')).toContain(
      '1234 5678 9012 3456',
    );
  });

  it('redacts IPv4 and IPv6 literals', () => {
    expect(redact('peer at 10.0.42.55 today')).toBe('peer at [ip] today');
    // Full + compressed forms must mask the entire address — a regex that
    // greedily matches the prefix only and leaves `::abcd` exposed is the
    // bug fixed in PR #79's review-fix patch.
    expect(redact('peer at 2001:db8:0:1::abcd today')).toBe(
      'peer at [ip] today',
    );
    // Compressed link-local + scoped-id forms commonly appear in Node net
    // logs and DHCPv6 traces — must mask the whole address, not just `::1`.
    expect(redact('peer fe80::1 hello')).toBe('peer [ip] hello');
    expect(redact('peer fe80::1%eth0 hello')).toBe('peer [ip] hello');
    expect(redact('peer fc00::1 hello')).toBe('peer [ip] hello');
    // IPv4-mapped (::ffff:v4) must mask the entire address as one unit so
    // the `::ffff:` prefix is not left exposed when the v4 tail is masked
    // by the IPv4 matcher in isolation.
    expect(redact('peer ::ffff:1.2.3.4 hello')).toBe('peer [ip] hello');
    expect(redact('::1 loop')).toBe('[ip] loop');
  });

  it('does NOT redact pure-decimal colon-separated text as IPv6', () => {
    // Regression guard for the over-broad IPv6 alternation that landed in
    // commit 4ae04c9 (PR #79 review-fix patch). The earlier regex made the
    // leading hex group optional, which let any 3+ colon-separated decimal
    // tokens be claimed as `[ip]` — clobbering HH:MM:SS times, ISO
    // timestamps' time portion, and `abc:def:ghi`-shaped trace headers.
    // Real IPv6 addresses always either contain `::` (compressed form) or
    // at least one hex letter; the post-fix regex requires one of those,
    // so each of the inputs below stays unmasked by the IP matcher.
    expect(redact('12:30:45')).toBe('12:30:45');
    expect(redact('meeting at 10:30:45 today')).toBe(
      'meeting at 10:30:45 today',
    );
    // Time-of-day with AM/PM suffix — the trailing letters used to be
    // pulled into the IPv6 match as a `%zone`-shaped tail.
    expect(redact('09:15:30 PM')).toBe('09:15:30 PM');
    // ISO-8601 timestamp: the time portion stays intact as far as the IP
    // matcher is concerned. The phone matcher still claims the leading
    // date run (documented behaviour in README L200) — that is a separate
    // pattern's trade-off, not an IPv6 regression.
    expect(redact('2026-05-01T10:30:45')).toBe('[phone]T10:30:45');
    // Pure-decimal full-form (no `::`, no hex letter) is technically a
    // valid all-zero-prefixed IPv6 address but vanishingly rare in real
    // telemetry. The false-positive cost on port lists and version
    // triples dominates, so the regex deliberately does not match.
    expect(redact('1:2:3:4:5:6:7:8')).toBe('1:2:3:4:5:6:7:8');
    // Trace-style header with three colon-separated tokens that each
    // contain hex letters but NO `::`. Must remain unmasked because the
    // shape (3 tokens, no compressed `::`) is not a real IPv6 address.
    expect(redact('X-Trace: abc:def:ghi')).toBe('X-Trace: abc:def:ghi');
    expect(redact('a:b:c')).toBe('a:b:c');
    expect(redact('a:b:c:d')).toBe('a:b:c:d');
  });

  it('redacts US SSN and UK NI numbers', () => {
    expect(redact('ssn: 987-65-4321')).toBe('ssn: [ssn]');
    expect(redact('ni: AB 12 34 56 C')).toBe('ni: [ssn]');
  });

  it('redacts E.164 phone numbers, gated on 8-15 digit length', () => {
    expect(redact('call +1 415 555 0199')).toContain('[phone]');
    // 6 digits is below the sanity floor — not redacted.
    expect(redact('issue#12-34-56')).toContain('12-34-56');
  });

  it('redacts AWS access keys', () => {
    expect(redact('key=AKIAIOSFODNN7EXAMPLE')).toBe('key=[aws-key]');
  });

  it('redacts GitHub tokens', () => {
    expect(redact('tok=ghp_01234567890123456789012345678901abcd')).toBe(
      'tok=[gh-token]',
    );
  });
});

describe('createRedactor — disable + custom', () => {
  it('skips a built-in pattern when its name is disabled', () => {
    const r = createRedactor(new Set(['phone']));
    expect(r('call +1 415 555 0199')).toContain('+1 415 555 0199');
  });

  it('appends custom patterns after built-ins', () => {
    const r = createRedactor(new Set(), [
      { pattern: /widget-\d+/g, replacement: '[w]' },
    ]);
    expect(r('hits: widget-42 widget-99')).toBe('hits: [w] [w]');
  });

  it('default replacement for bare RegExp custom is [redacted]', () => {
    const re = /xyz-\w+/g;
    const r = createRedactor(new Set(), [
      { pattern: re, replacement: '[redacted]' },
    ]);
    expect(r('seen xyz-abc')).toBe('seen [redacted]');
  });
});

describe('redactValue', () => {
  it('walks nested structures', () => {
    const out = redactValue({
      headers: { Authorization: 'Bearer abc.def.ghi' },
      list: ['mailto user at work@example.com'],
    });
    expect(JSON.stringify(out)).toContain('[redacted]');
    expect(JSON.stringify(out)).toContain('[email]');
  });

  it('preserves non-string primitives', () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(null)).toBe(null);
    expect(redactValue(true)).toBe(true);
  });
});
