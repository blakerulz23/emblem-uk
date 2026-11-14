import { describe, expect, it } from 'vitest';
import { EMAIL_REDACTED, redactEmails } from './redact-email';

describe('redactEmails', () => {
  it('removes every address, keeps the rest of the text', () => {
    expect(redactEmails('user a.b+c@sub.example.co.uk and O\'Neil@EXAMPLE.TEST failed')).toBe(`user ${EMAIL_REDACTED} and ${EMAIL_REDACTED} failed`);
  });
  it('leaves text without an address unchanged', () => {
    expect(redactEmails('Auth service unavailable (500)')).toBe('Auth service unavailable (500)');
  });
});

describe('redactEmails — less common forms', () => {
  it('non-ASCII local parts, IDN and punycode domains, and encoded @', () => {
    for (const addr of ['josé@example.com', 'user@пример.рф', 'user@example.xn--p1ai', 'user%40example.com', 'user\u0040example.com']) {
      const out = redactEmails(`failed for ${addr}: done`);
      expect(out).toBe(`failed for ${EMAIL_REDACTED}: done`);
    }
  });
  it('keeps surrounding punctuation', () => {
    expect(redactEmails('<a@b.co>, "c@d.org"')).toBe(`<${EMAIL_REDACTED}>, "${EMAIL_REDACTED}"`);
  });
});
