import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * Explicit staff-triggered resend for a single-card order's post-approval
 * invitation. Safe to call any number of times: createGuardianInvite
 * reuses the existing unused/unexpired invite rather than minting a new
 * one, so this can't create duplicate active invitations — it only
 * re-sends the email and updates email_status/email_sent_at.
 *
 * "Single-card" is exactly-one-linked-card, same rule as the approve
 * route — see its doc comment for why this no longer checks
 * orders.source.
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
    .select('id, payment_status, purchaser_email, intended_guardian_email')
    .eq('id', params.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 404 });
  }

  if (order.payment_status !== 'fulfilled') {
    return NextResponse.json({ error: 'Only approved orders have an invitation to resend' }, { status: 400 });
  }

  const { data: cards } = await serviceRole
    .from('cards')
    .select('player_id')
    .eq('order_id', order.id)
    .not('player_id', 'is', null);

  const linkedCards = cards ?? [];
  if (linkedCards.length !== 1) {
    return NextResponse.json({ error: 'Resend is only available for single-card orders' }, { status: 400 });
  }

  const playerId = linkedCards[0].player_id;
  const recipient = order.intended_guardian_email?.trim() || order.purchaser_email?.trim();
  if (!playerId || !recipient) {
    return NextResponse.json({ error: 'No player or recipient email on this order' }, { status: 400 });
  }

  await createGuardianInvite(serviceRole, playerId, null, recipient, 'order_approval', order.id);

  return NextResponse.json({ ok: true, resent: 1 });
}
