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

  it('calls mark_squad_invite_participation_paid only for squad_invite orders, and only once apply_gate3_payment_event reports the transition actually applied', () => {
    const rpcIndex = source.indexOf("rpc('apply_gate3_payment_event'");
    const coachCardIfIndex = source.indexOf("result?.applied && existing.source === 'squad_invite'");
    const coachCardRpcIndex = source.indexOf("rpc('mark_squad_invite_participation_paid'");
    expect(rpcIndex).toBeGreaterThan(-1);
    expect(coachCardIfIndex).toBeGreaterThan(rpcIndex);
    expect(coachCardRpcIndex).toBeGreaterThan(coachCardIfIndex);
  });

  it('a failure in the coach-card bookkeeping never fails the webhook response — the payment already succeeded and must not be retried by Shopify', () => {
    const bookkeepingBlock = source.slice(source.indexOf("result?.applied && existing.source === 'squad_invite'"), source.indexOf('return NextResponse.json({ ok: true, orderId'));
    expect(bookkeepingBlock).not.toMatch(/return NextResponse\.json\(\{\s*error/);
  });
});
