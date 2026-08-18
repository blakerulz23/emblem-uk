import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/api/webhooks/shopify/orders-paid/route.ts', 'utf8');

// Guards the fix for a real, confirmed bug: squad_invites.coach_card_eligible
// could structurally never become true because nothing ever set a
// participation's status to 'paid'. This webhook is the single source of
// truth for a genuine payment, so it's the one place that transition
// belongs — see mark_squad_invite_participation_paid, migration 0059.
describe('orders-paid webhook — wires real payment to Squad Invite coach-card eligibility', () => {
  it('selects orders.source so it can identify a Squad Invite order', () => {
    expect(source).toContain('select(\'id, payment_status, source\')');
  });

  it('calls mark_squad_invite_participation_paid only for squad_invite orders, after the payment flip already succeeded', () => {
    const updateIndex = source.indexOf("update({ payment_status: 'paid' })");
    const rpcIndex = source.indexOf("rpc('mark_squad_invite_participation_paid'");
    expect(updateIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(updateIndex);
    expect(source).toContain("existing.source === 'squad_invite'");
  });

  it('a failure in the coach-card bookkeeping never fails the webhook response — the payment already succeeded and must not be retried by Shopify', () => {
    const bookkeepingBlock = source.slice(source.indexOf("existing.source === 'squad_invite'"), source.indexOf('return NextResponse.json({ ok: true, orderId'));
    expect(bookkeepingBlock).not.toMatch(/return NextResponse\.json\(\{\s*error/);
  });
});
