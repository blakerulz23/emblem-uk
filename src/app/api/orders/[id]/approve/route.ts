import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * The one staff action that unblocks claiming for an order's cards — flips
 * an order to 'fulfilled'. A bare Shopify redirect or a submitted enquiry
 * is never itself proof of purchase, so this manual step is what actually
 * makes a card's claim_token start resolving as claimable.
 *
 * Gated on requireStaff — approving an order now also triggers a real
 * customer-facing email for single-card orders, so this can no longer be
 * the unauthenticated "Internal · Staff only" convention it used to be.
 *
 * Single-recipient detection is based on how many cards are actually
 * linked to the order, not `orders.source`. That field no longer reflects
 * live reality: every order placed through the current builder — one card
 * or a full squad — is recorded as 'team_order' ('standalone_order' is
 * dead; its only creator, PrintFileBlock.tsx, isn't mounted anywhere in
 * the app). A single linked card is still the same unambiguous
 * one-purchaser-one-recipient case the old standalone flow meant to
 * capture — the field just isn't reliable anymore, the count is.
 *
 * More than one linked card: no auto-invite. Connecting a real squad
 * order's players to a specific coach's Coach OS roster is Phase 2 — this
 * route must not email the purchaser/coach a bundle of child claim links,
 * and must not imply the players are already invitable.
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
    .select('id, purchaser_email, intended_guardian_email')
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 500 });
  }

  const { data: cards } = await serviceRole
    .from('cards')
    .select('player_id')
    .eq('order_id', order.id)
    .not('player_id', 'is', null);

  const linkedCards = cards ?? [];
  let inviteTriggered = false;

  if (linkedCards.length === 1) {
    const playerId = linkedCards[0].player_id;
    const recipient = order.intended_guardian_email?.trim() || order.purchaser_email?.trim();
    if (playerId && recipient) {
      await createGuardianInvite(serviceRole, playerId, null, recipient, 'order_approval', order.id);
      inviteTriggered = true;
    }
  }

  return NextResponse.json({ ok: true, orderId: order.id, inviteTriggered });
}
