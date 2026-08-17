import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { buildSquadInvitePaymentUrl } from '@/lib/squad-invite-payment-link';
import { sendSquadInvitePaymentRequestEmail } from '@/lib/send-squad-invite-payment-request-email';

/**
 * Finalises a campaign's pricing (locks in the real tier/unit price from
 * final headcount), then — only when the payment wall is actually on —
 * issues a 72-hour payment request to every parent who completed a
 * commitment, and emails each one their own payment link.
 *
 * The wall check (squad_invite_payment_mode_enabled()) mirrors exactly
 * how /api/orders/[id]/approve already gates on it: issuing a payment
 * request is real-payment behaviour, so it respects the same hardcoded,
 * migration-only switch — never a runtime flag. While the wall is off
 * (as it is today), this still finalises pricing but issues nothing,
 * same as before this change (paymentRequestsEnabled stays false).
 *
 * A participation that fails link-building or email-sending after its
 * payment request was already issued (its 72h window has genuinely
 * started) is a known, not-yet-solved gap — there is no reconciliation
 * view yet to surface it to staff. See the payment-flow scoping notes.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff(createClient());
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();

  const { data, error } = await service.rpc('finalise_squad_invite_pricing', { p_campaign_id: params.id });
  if (error) return NextResponse.json({ error: 'Campaign pricing could not be finalised' }, { status: 409 });
  const pricing = data as { tier?: 'single' | 'multi' | 'squad'; unitPricePence?: number };

  const { data: paymentModeEnabled } = await service.rpc('squad_invite_payment_mode_enabled');
  if (paymentModeEnabled !== true || !pricing.tier || !pricing.unitPricePence) {
    return NextResponse.json({ ok: true, pricing: data, paymentRequestsEnabled: false });
  }

  const { data: campaign } = await service.from('squad_invites').select('club_team_name').eq('id', params.id).maybeSingle();
  const { data: eligible } = await service
    .from('squad_invite_participations')
    .select('id, orders(order_ref, purchaser_email)')
    .eq('campaign_id', params.id)
    .eq('status', 'commitment_completed');

  let issued = 0;
  let failed = 0;
  for (const participation of eligible ?? []) {
    const orderRow = Array.isArray(participation.orders) ? participation.orders[0] : participation.orders;
    if (!orderRow?.order_ref || !orderRow?.purchaser_email) {
      failed++;
      continue;
    }
    const { data: issueResult, error: issueError } = await service.rpc('issue_squad_invite_payment_request', {
      p_participation_id: participation.id,
    });
    if (issueError || !issueResult) {
      failed++;
      continue;
    }
    const result = issueResult as { printQuantity: number };
    const paymentUrl = buildSquadInvitePaymentUrl(pricing.tier, result.printQuantity, orderRow.order_ref);
    if (!paymentUrl) {
      failed++;
      continue;
    }
    const sent = await sendSquadInvitePaymentRequestEmail({
      toEmail: orderRow.purchaser_email,
      teamName: campaign?.club_team_name ?? '',
      paymentUrl,
      unitPricePence: pricing.unitPricePence,
      printQuantity: result.printQuantity,
    });
    if (sent.ok) issued++; else failed++;
  }

  return NextResponse.json({ ok: true, pricing: data, paymentRequestsEnabled: true, issued, failed });
}
