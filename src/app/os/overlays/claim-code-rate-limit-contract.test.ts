import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// F1: a rate-limited lookup (HTTP 429) must not be shown to a parent as
// "That code isn't recognised", which sends them to retype a good code.
describe('ClaimCodeEntry rate-limit message (F1)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'ClaimCodeEntry.tsx'), 'utf8');

  it('checks for 429 on both the card and the invite lookup', () => {
    expect(src.match(/\.status === 429/g)?.length).toBe(2);
  });

  it('shows a wait message for the rate-limited state', () => {
    expect(src).toContain("status === 'rateLimited'");
    expect(src).toContain('Too many attempts. Please wait 15 minutes, then try again.');
  });

  it('still shows "not recognised" only for a genuine miss', () => {
    expect(src).toContain("status === 'error'");
    expect(src).toContain('That code isn&apos;t recognised');
  });
});
