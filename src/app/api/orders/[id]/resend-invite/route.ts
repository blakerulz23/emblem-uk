import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * Explicit staff-triggered resend for a standalone order's post-approval
 * invitation. Safe to call any number of times: createGuardianInvite
 * reuses the existing unused/unexpired invite for each player rather than
 * minting a new one, so this can't create duplicate active invitations —
 * it only re-sends the email and updates email_status/email_sent_at.
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
    .select('id, source, payment_status, purchaser_email, intended_guardian_email')
    .eq('id', params.id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 404 });
  }

  if (order.source !== 'standalone_order' || order.payment_status !== 'fulfilled') {
    return NextResponse.json({ error: 'Only approved standalone orders have an invitation to resend' }, { status: 400 });
  }

  const recipient = order.intended_guardian_email?.trim() || order.purchaser_email?.trim();
  if (!recipient) {
    return NextResponse.json({ error: 'No recipient email on this order' }, { status: 400 });
  }

  const { data: cards } = await serviceRole
    .from('cards')
    .select('player_id')
    .eq('order_id', order.id)
    .not('player_id', 'is', null);

  let resent = 0;
  for (const card of cards ?? []) {
    if (!card.player_id) continue;
    await createGuardianInvite(serviceRole, card.player_id, null, recipient, 'order_approval', order.id);
    resent += 1;
  }

  return NextResponse.json({ ok: true, resent });
}
