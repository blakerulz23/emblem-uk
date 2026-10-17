import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * A fully refunded order must never stay printable or keep counting
 * towards the free coach card. This pins every link in that chain, so a
 * later change to any one of them fails here rather than in production:
 *
 *   refunds/create (full) ─► orders.payment_status = 'refunded'
 *                         └► participation paid/production_accepted ─► 'refunded'
 *                            └► reconcile_squad_invite_coach_eligibility
 *   approve ─► only 'paid' orders can be approved (single card and Squad Invite)
 *   /staff/queue production list ─► only 'fulfilled' orders
 *   coach card ─► counts only 'paid' participations; production_eligible follows
 */
const read = (path: string) => readFileSync(path, 'utf8');
const refundRoute = read('src/app/api/webhooks/shopify/refunds-create/route.ts');
const approveRoute = read('src/app/api/orders/[id]/approve/route.ts');
const staffQueue = read('src/app/staff/queue/page.tsx');
const foundation = read('supabase/migrations/0050_squad_invite_foundation.sql');

describe('refunded orders: never printable, never counted', () => {
  it('a full refund moves the family out of paid and recomputes the coach card', () => {
    expect(refundRoute).toContain("p_to_status: 'refunded'");
    expect(refundRoute).toContain(".update({ status: 'refunded', updated_at: new Date().toISOString() })");
    expect(refundRoute).toContain(".in('status', ['paid', 'production_accepted'])");
    expect(refundRoute).toContain("rpc('reconcile_squad_invite_coach_eligibility', { p_campaign_id: campaignId })");
  });

  it('the coach card counts only paid families and its production flag follows eligibility', () => {
    const reconcile = foundation.slice(foundation.indexOf('function public.reconcile_squad_invite_coach_eligibility'));
    expect(reconcile).toMatch(/where campaign_id = p_campaign_id and status = 'paid' and order_id is not null/);
    expect(reconcile).toMatch(/v_eligible := v_paid >= 10/);
    expect(reconcile).toMatch(/update public\.squad_invite_coach_cards set production_eligible = v_eligible/);
  });

  it('only paid orders can be approved for production (single card and Squad Invite), and Shopify-cancelled orders never', () => {
    expect(approveRoute).toMatch(/sourceRow\.payment_status !== 'paid'/);
    expect(approveRoute).toMatch(/paymentModeEnabled === true && orderRow\.payment_status !== 'paid'/);
    expect(approveRoute).toContain(".eq('topic', 'orders/cancelled')");
  });

  it('the staff production list shows only fulfilled (approved, still paid) orders, so a refunded one drops off', () => {
    const productionQueries = staffQueue.match(/\.eq\('payment_status', 'fulfilled'\)/g) ?? [];
    expect(productionQueries.length).toBeGreaterThanOrEqual(1);
  });
});
