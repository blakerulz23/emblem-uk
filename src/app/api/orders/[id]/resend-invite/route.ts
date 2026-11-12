import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';
import { resolveProfileInviteRecipient, retireOtherOrderApprovalInvites } from '@/lib/gift-order-guardian';

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
    .select('id, payment_status, purchaser_email, intended_guardian_email, authority_status')
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
  // Same recipient rule as the approve route: a gift order's profile invite
  // goes only to the guardian who approved it, never to the buyer, and a
  // pending or declined gift order never gets one.
  const recipient = await resolveProfileInviteRecipient(serviceRole, {
    id: order.id,
    authority_status: order.authority_status ?? null,
    purchaser_email: order.purchaser_email ?? null,
    intended_guardian_email: order.intended_guardian_email ?? null,
  });
  if (!recipient.ok && (recipient.reason === 'guardian_not_approved' || recipient.reason === 'approved_guardian_missing')) {
    return NextResponse.json({ error: 'This order has no approving guardian on record, so no profile invite can be sent' }, { status: 409 });
  }
  if (!recipient.ok && recipient.reason === 'lookup_failed') {
    return NextResponse.json({ error: 'Could not resend the invite. Please try again.' }, { status: 500 });
  }
  if (!playerId || !recipient.ok) {
    return NextResponse.json({ error: 'No player or recipient email on this order' }, { status: 400 });
  }

  // A gift order approved before this fix may still have a live invite that
  // went to the buyer. Retire it before sending the guardian's own one.
  if (recipient.source === 'approved_guardian') {
    const retired = await retireOtherOrderApprovalInvites(serviceRole, order.id, recipient.email);
    if (!retired.ok) {
      return NextResponse.json({ error: 'Could not resend the invite. Please try again.' }, { status: 500 });
    }
  }

  await createGuardianInvite(serviceRole, playerId, null, recipient.email, 'order_approval', order.id);

  return NextResponse.json({ ok: true, resent: 1 });
}
