import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/webhooks/shopify/orders-paid/route.ts', 'utf8');

// Guards the fix for a real, confirmed bug: squad_invites.coach_card_eligible
// could structurally never become true because nothing ever set a
// participation's status to 'paid'. This webhook is the single source of
// truth for a genuine payment, so it's the one place that transition
// belongs — see mark_squad_invite_participation_paid, migration 0059.
describe('orders-paid webhook — wires real payment to Squad Invite coach-card eligibility', () => {
  it('selects orders.source (plus the Gate 3 pricing snapshot needed for line-item verification) so it can identify a Squad Invite order', () => {
    expect(source).toContain("select('id, payment_status, source, unit_price_pence, total_print_quantity, currency')");
  });

  it('calls mark_squad_invite_participation_paid only for squad_invite orders, after apply_gate3_payment_event, and only while the order is currently paid', () => {
    const rpcIndex = source.indexOf("rpc('apply_gate3_payment_event'");
    const coachCardIfIndex = source.indexOf("existing.source === 'squad_invite' && (result?.applied || result?.reason === 'duplicate_event' || result?.reason === 'already_paid')");
    const paidGuardIndex = source.indexOf("currentStatus === 'paid' || currentStatus === 'fulfilled'");
    const coachCardRpcIndex = source.indexOf("rpc('mark_squad_invite_participation_paid'");
    expect(rpcIndex).toBeGreaterThan(-1);
    expect(coachCardIfIndex).toBeGreaterThan(rpcIndex);
    expect(paidGuardIndex).toBeGreaterThan(coachCardIfIndex);
    expect(coachCardRpcIndex).toBeGreaterThan(paidGuardIndex);
  });

  // Updated deliberately (payment-safety branch): a bookkeeping failure used
  // to be swallowed, which could leave a paying family out of the paid count
  // for good. Retrying is safe because apply_gate3_payment_event records each
  // delivery once (a retry arrives as duplicate_event and cannot double-pay),
  // and the retry is what completes the bookkeeping.
  it('a failure in the coach-card bookkeeping asks Shopify to retry (500); the retry re-runs it without re-applying the payment', () => {
    const bookkeepingBlock = source.slice(source.indexOf("rpc('mark_squad_invite_participation_paid'"), source.indexOf('return NextResponse.json({ ok: true, orderId'));
    expect(bookkeepingBlock).toMatch(/if \(coachCardError\) \{[\s\S]*status: 500/);
  });
});
