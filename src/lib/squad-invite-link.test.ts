import { describe, expect, it } from 'vitest';
import {
  UNAVAILABLE_INVITATION, assertSafeSquadInviteProjection, createSquadInviteLinkToken,
  hashSquadInviteLinkToken,
} from './squad-invite-link';

describe('Squad Invite reusable link credentials', () => {
  it('creates independent high-entropy credentials and stores only stable hashes', () => {
    const first = createSquadInviteLinkToken();
    const second = createSquadInviteLinkToken();
    expect(first.token).toHaveLength(43);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashSquadInviteLinkToken(first.token));
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed tokens before lookup', () => {
    expect(() => hashSquadInviteLinkToken('campaign-id')).toThrow('Invalid invitation credential');
  });

  it('allows only the explicit safe public projection', () => {
    const safe = {
      teamName: 'Example FC', ageGroup: 'Under 10', deadlineAt: '2026-09-01T12:00:00Z',
      completedCommitments: 4, currentIncentive: 'multi' as const, squadPriceUnlocked: false,
      freeCoachCardConfirmed: false, deliverySummary: 'One team delivery to the authorised organiser.',
      badgeReference: null, productSummary: 'Personalised NFC-connected sporting card.',
    };
    expect(assertSafeSquadInviteProjection(safe)).toEqual(safe);
    expect(() => assertSafeSquadInviteProjection({ ...safe, childName: 'Never' })).toThrow(/Unsafe/);
    expect(() => assertSafeSquadInviteProjection({ ...safe, deliveryAddress: 'Never' })).toThrow(/Unsafe/);
  });

  it('uses one uniform unavailable response', () => {
    expect(UNAVAILABLE_INVITATION).toEqual({ error: 'Squad Invite unavailable' });
  });
});
