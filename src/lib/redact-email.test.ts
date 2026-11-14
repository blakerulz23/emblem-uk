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
