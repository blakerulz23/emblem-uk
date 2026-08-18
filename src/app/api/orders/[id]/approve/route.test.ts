import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/orders/[id]/approve/route.ts', 'utf8');

describe('POST /api/orders/[id]/approve — Squad Invite rejected-photo guard', () => {
  it('refuses to approve an order whose photo has been rejected (migration 0063), before the payment-mode check', () => {
    const fnBody = source.slice(source.indexOf('async function approveSquadInviteOrder'));
    const guardIndex = fnBody.indexOf("eq('status', 'rejected')");
    const paymentModeIndex = fnBody.indexOf("rpc('squad_invite_payment_mode_enabled')");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(paymentModeIndex).toBeGreaterThan(guardIndex);
    expect(fnBody).toContain("This order's photo was rejected — cannot approve until it's replaced");
  });

  it('checks card_definitions, not a separate ad hoc flag', () => {
    const fnBody = source.slice(source.indexOf('async function approveSquadInviteOrder'));
    expect(fnBody).toContain(".from('card_definitions')");
  });
});
