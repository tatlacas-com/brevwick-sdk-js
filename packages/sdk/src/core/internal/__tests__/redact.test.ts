import { describe, expect, it } from 'vitest';
import { redact, redactValue } from '../redact';

describe('redact', () => {
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
