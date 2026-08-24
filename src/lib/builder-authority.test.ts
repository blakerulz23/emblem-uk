import { describe, expect, it } from 'vitest';
import {
  generateGuardianApprovalToken,
  hashGuardianApprovalToken,
  isValidGuardianApprovalToken,
  timingSafeStringEqual,
} from './builder-authority';
import { BUILDER_AUTHORITY_CONFIRMATIONS, BUILDER_AUTHORITY_DECLARATION_VERSION } from './builder-authority-shared';

describe('builder-authority token helpers', () => {
  it('generates a token matching isValidGuardianApprovalToken', () => {
    const token = generateGuardianApprovalToken();
    expect(isValidGuardianApprovalToken(token)).toBe(true);
  });

  it('generates unique tokens across calls', () => {
    const a = generateGuardianApprovalToken();
    const b = generateGuardianApprovalToken();
    expect(a).not.toBe(b);
  });

  it('hashes deterministically to a 64-char lowercase hex string', () => {
    const token = generateGuardianApprovalToken();
    const hash = hashGuardianApprovalToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGuardianApprovalToken(token)).toBe(hash);
  });

  it('produces different hashes for different tokens', () => {
    const a = hashGuardianApprovalToken(generateGuardianApprovalToken());
    const b = hashGuardianApprovalToken(generateGuardianApprovalToken());
    expect(a).not.toBe(b);
  });

  it('rejects malformed token shapes', () => {
    expect(isValidGuardianApprovalToken('')).toBe(false);
    expect(isValidGuardianApprovalToken('short')).toBe(false);
    expect(isValidGuardianApprovalToken(123)).toBe(false);
    expect(isValidGuardianApprovalToken(null)).toBe(false);
    expect(isValidGuardianApprovalToken('!'.repeat(32))).toBe(false);
  });

  it('timingSafeStringEqual compares equal and unequal strings correctly', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
    expect(timingSafeStringEqual('abc', 'abd')).toBe(false);
    expect(timingSafeStringEqual('abc', 'abcd')).toBe(false);
  });
});

describe('builder-authority-shared constants', () => {
  it('exposes exactly the three confirmation strings the product spec requires', () => {
    expect(BUILDER_AUTHORITY_CONFIRMATIONS.ageAndAuthority).toBe(
      'I confirm that I am 18 or over and authorised to create this card.'
    );
    expect(BUILDER_AUTHORITY_CONFIRMATIONS.photoPermission).toBe(
      'I confirm that I have permission to upload and process this photograph.'
    );
    expect(BUILDER_AUTHORITY_CONFIRMATIONS.cardCreation).toBe(
      'I approve the creation and printing of this personalised card.'
    );
  });

  it('has a non-empty declaration version', () => {
    expect(BUILDER_AUTHORITY_DECLARATION_VERSION.length).toBeGreaterThan(0);
  });
});
