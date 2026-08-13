import { describe, expect, it } from 'vitest';
import {
  SQUAD_INVITE_PRICING_POLICY,
  priceSquadInviteCommitments,
  squadInviteCoachCardEligible,
} from './squad-invite-pricing';

describe('Squad Invite commitment pricing policy', () => {
  it.each([
    [1, 2499, 'single'],
    [2, 2199, 'multi'],
    [9, 2199, 'multi'],
    [10, 1899, 'squad'],
    [14, 1899, 'squad'],
  ] as const)('prices %i completed commitments at the canonical tier', (count, unit, tier) => {
    const quote = priceSquadInviteCommitments({
      completedEligibleCommitmentCount: count,
      totalPrintQuantity: count,
    });
    expect(quote.policy).toBe(SQUAD_INVITE_PRICING_POLICY);
    expect(quote.qualificationBasis).toBe('completed_eligible_commitments');
    expect(quote.unitPricePence).toBe(unit);
    expect(quote.tier).toBe(tier);
  });

  it('uses print quantity only for subtotal, never the distinct commitment tier', () => {
    const quote = priceSquadInviteCommitments({
      completedEligibleCommitmentCount: 1,
      totalPrintQuantity: 10,
    });
    expect(quote.tier).toBe('single');
    expect(quote.subtotalPence).toBe(10 * 2499);
  });

  it('keeps campaign coach qualification separate from commitment pricing', () => {
    expect(squadInviteCoachCardEligible(9)).toBe(false);
    expect(squadInviteCoachCardEligible(10)).toBe(true);
    expect(squadInviteCoachCardEligible(12)).toBe(true);
  });
});
