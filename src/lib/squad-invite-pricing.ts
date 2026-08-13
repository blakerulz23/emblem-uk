import { priceOrder, type PricingResult } from './pricing-engine';

export const SQUAD_INVITE_PRICING_POLICY = 'squad_invite_commitment_pricing_v1' as const;

export interface SquadInviteCommitmentPricingInput {
  completedEligibleCommitmentCount: number;
  totalPrintQuantity: number;
}

export interface SquadInviteCommitmentPricing extends PricingResult {
  policy: typeof SQUAD_INVITE_PRICING_POLICY;
  qualificationBasis: 'completed_eligible_commitments';
}

/**
 * Controlled-pilot policy: the frozen campaign tier follows distinct
 * completed eligible commitments, not payment. Monetary constants and
 * arithmetic still come exclusively from the general pricing engine.
 * Coach-card eligibility from priceOrder must not be used for campaigns:
 * a campaign coach card separately requires ten successful payments.
 */
export function priceSquadInviteCommitments(
  input: SquadInviteCommitmentPricingInput,
): SquadInviteCommitmentPricing {
  const result = priceOrder({
    paidPlayerCount: input.completedEligibleCommitmentCount,
    totalPrintQuantity: input.totalPrintQuantity,
  });

  return {
    ...result,
    policy: SQUAD_INVITE_PRICING_POLICY,
    qualificationBasis: 'completed_eligible_commitments',
  };
}

export function squadInviteCoachCardEligible(qualifyingPaidPlayerCount: number): boolean {
  if (!Number.isInteger(qualifyingPaidPlayerCount) || qualifyingPaidPlayerCount < 0) {
    throw new Error('qualifyingPaidPlayerCount must be a non-negative integer');
  }
  return qualifyingPaidPlayerCount >= 10;
}
