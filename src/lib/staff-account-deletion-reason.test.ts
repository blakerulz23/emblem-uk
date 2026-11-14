import { describe, expect, it } from 'vitest';
import { validateStaffReason } from './staff-account-deletion';

/** The staff reason is kept permanently in an append-only audit (migration 0097 refuses an email in it too). */
describe('validateStaffReason — no email addresses', () => {
  it('refuses a reason containing an email address, before anything is sent', () => {
    expect(validateStaffReason('Parent confirmed from someone@example.test')).toMatch(/Leave email addresses out/);
  });
  it('accepts an ordinary reason, and an @ that is not an address', () => {
    expect(validateStaffReason('Assessments reassigned to the club @ 3pm')).toBeNull();
    expect(validateStaffReason('Parent confirmed by phone')).toBeNull();
  });
});
