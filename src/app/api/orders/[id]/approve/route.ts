import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * The one staff action that unblocks claiming for an order's cards — flips
 * an order to 'fulfilled'. A bare Shopify redirect or a submitted enquiry
 * is never itself proof of purchase (no webhook/Admin API access exists
 * for the standalone path), so this manual step is what actually makes a
 * card's claim_token start resolving as claimable.
 *
 * Gated on requireStaff — approving an order now also triggers a real
 * customer-facing email for standalone orders, so this can no longer be
 * the unauthenticated "Internal · Staff only" convention it used to be.
 *
 * Team orders: approval only flips the status. Per the staff-queue gaps
 * plan, connecting a team order's players to a specific coach's Coach OS
 * roster is Phase 2 (a verified-coach-identity bridge) — this route must
 * not email the purchaser/coach a bundle of child claim links, and must
 * not imply the players are already invitable.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const serviceRole = createServiceRoleClient();

  const { data: order, error } = await serviceRole
    .from('orders')
    .update({
      payment_status: 'fulfilled',
      approved_by: staffCheck.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, source, purchaser_email, intended_guardian_email')
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 500 });
  }

  let inviteTriggered = false;

  if (order.source === 'standalone_order') {
    const recipient = order.intended_guardian_email?.trim() || order.purchaser_email?.trim();

    if (recipient) {
      const { data: cards } = await serviceRole
        .from('cards')
        .select('player_id')
        .eq('order_id', order.id)
        .not('player_id', 'is', null);

      for (const card of cards ?? []) {
        if (!card.player_id) continue;
        await createGuardianInvite(serviceRole, card.player_id, null, recipient, 'order_approval', order.id);
        inviteTriggered = true;
      }
    }
  }

  return NextResponse.json({ ok: true, orderId: order.id, inviteTriggered });
}
