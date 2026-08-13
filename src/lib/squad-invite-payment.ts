export interface SquadInvitePaymentRequest {
  participationId: string;
  amountPence: number;
  currency: 'GBP';
  issuedAt: string;
  deadline: string;
  reconciliationReference: string;
}

export interface SquadInvitePaymentAdapter {
  readonly enabled: boolean;
  createPaymentRequest(input: SquadInvitePaymentRequest): Promise<{ externalReference: string }>;
}

/**
 * Payment requests are deliberately disabled until Shopify Draft Order (or
 * another existing mechanism), VAT, included delivery and webhook coverage
 * have been verified. A commitment is never payment.
 */
export const disabledSquadInvitePaymentAdapter: SquadInvitePaymentAdapter = {
  enabled: false,
  async createPaymentRequest() {
    throw new Error('Squad Invite payment requests are not configured');
  },
};
