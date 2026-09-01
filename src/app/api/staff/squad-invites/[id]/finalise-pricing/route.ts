import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { buildSquadInvitePaymentUrl } from '@/lib/squad-invite-payment-link';
import { sendSquadInvitePaymentRequestEmail } from '@/lib/send-squad-invite-payment-request-email';
import { sendSquadInvitePricingConfirmedEmail } from '@/lib/send-squad-invite-pricing-confirmed-email';
import { createSquadInvitePaymentPreviewToken } from '@/lib/squad-invite-payment-preview-token';

/**
 * Same site-URL fallback nfc-link.ts's buildNfcCardUrl already uses — kept
 * as a literal duplicate rather than a shared import, since the two
 * callers are otherwise unrelated (one builds a physical-card claim URL,
 * this builds a payment-preview URL) and this codebase's own convention
 * elsewhere (send-squad-invite-early-preview-email.ts vs. its siblings) is
 * to accept a little duplication over coupling two independent concerns.
 */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
}

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
 *
 * Requires Approver specifically, not just generic staff — this route
 * genuinely issues real payment requests once the wall is on, the same
 * financial weight as /api/orders/[id]/approve and the campaign-request
 * approve/cancel-approval routes, all of which already require Approver.
 *
 * Also sends every committed parent their price-confirmed email
 * (sendSquadInvitePricingConfirmedEmail) — unconditionally, regardless of
 * the payment wall, and only on a genuine first finalisation (pricing's
 * own `created` flag; false on an idempotent repeat call). This is why
 * the campaign/eligible-participations fetch below now runs unconditionally
 * instead of only inside the payment-wall branch — both loops share it.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();

  const { data, error } = await service.rpc('finalise_squad_invite_pricing', { p_campaign_id: params.id });
  if (error) return NextResponse.json({ error: 'Campaign pricing could not be finalised' }, { status: 409 });
  const pricing = data as {
    created?: boolean;
    tier?: 'single' | 'multi' | 'squad';
    unitPricePence?: number;
    commitmentCount?: number;
  };

  const { data: campaign } = await service.from('squad_invites').select('club_team_name').eq('id', params.id).maybeSingle();
  const { data: eligible } = await service
    .from('squad_invite_participations')
    .select('id, order_id, orders(order_ref, purchaser_email)')
    .eq('campaign_id', params.id)
    .eq('status', 'commitment_completed');

  let pricingNotified = 0;
  let pricingNotifyFailed = 0;
  if (pricing.created && pricing.tier && typeof pricing.unitPricePence === 'number' && typeof pricing.commitmentCount === 'number') {
    for (const participation of eligible ?? []) {
      try {
        const orderRow = Array.isArray(participation.orders) ? participation.orders[0] : participation.orders;
        if (!orderRow?.purchaser_email) {
          pricingNotifyFailed++;
          console.warn('pricing confirmed email skipped — no purchaser email on file', { participationId: participation.id });
          continue;
        }
        const sent = await sendSquadInvitePricingConfirmedEmail({
          toEmail: orderRow.purchaser_email,
          teamName: campaign?.club_team_name ?? 'your team',
          committedCount: pricing.commitmentCount,
          unitPricePence: pricing.unitPricePence,
          tier: pricing.tier,
        });
        if (sent.ok) {
          pricingNotified++;
        } else {
          pricingNotifyFailed++;
          console.warn('pricing confirmed email failed to send', { participationId: participation.id });
        }
      } catch (err) {
        pricingNotifyFailed++;
        console.warn('pricing confirmed email threw', { participationId: participation.id, err });
      }
    }
  }

  const { data: paymentModeEnabled } = await service.rpc('squad_invite_payment_mode_enabled');
  if (paymentModeEnabled !== true || !pricing.tier || !pricing.unitPricePence) {
    return NextResponse.json({ ok: true, pricing: data, paymentRequestsEnabled: false, pricingNotified, pricingNotifyFailed });
  }

  let issued = 0;
  let failed = 0;
  for (const participation of eligible ?? []) {
    const orderRow = Array.isArray(participation.orders) ? participation.orders[0] : participation.orders;
    if (!orderRow?.order_ref || !orderRow?.purchaser_email) {
      failed++;
      continue;
    }
    // Pre-flight only — confirms this tier's Shopify variant is actually
    // configured before minting a token/opening the 72-hour window at all.
    // The real checkout URL is rebuilt later, server-side, when the
    // preview page's own resolve step runs (same function, same inputs) —
    // never reused directly here, since print_quantity is only known
    // AFTER issue_squad_invite_payment_request returns below.
    if (!buildSquadInvitePaymentUrl(pricing.tier, 1, orderRow.order_ref)) {
      failed++;
      continue;
    }
    const previewCredential = createSquadInvitePaymentPreviewToken();
    const { data: issueResult, error: issueError } = await service.rpc('issue_squad_invite_payment_request', {
      p_participation_id: participation.id,
      p_preview_token_hash: previewCredential.hash,
    });
    if (issueError || !issueResult) {
      failed++;
      continue;
    }
    const result = issueResult as { printQuantity: number };
    // Points at the new preview page (shows the actual card + a price
    // summary before handing off to Shopify), not directly at Shopify —
    // see migration 0081 and squad-invite-payment-preview-token.ts. The
    // preview page's own resolve step is what rebuilds the real Shopify
    // checkout URL server-side via buildSquadInvitePaymentUrl, so this
    // route no longer calls that function itself.
    const paymentUrl = `${siteUrl()}/squad-invite/pay#token=${previewCredential.token}`;
    const sent = await sendSquadInvitePaymentRequestEmail({
      toEmail: orderRow.purchaser_email,
      teamName: campaign?.club_team_name ?? '',
      paymentUrl,
      unitPricePence: pricing.unitPricePence,
      printQuantity: result.printQuantity,
    });
    if (sent.ok) issued++; else failed++;
  }

  return NextResponse.json({ ok: true, pricing: data, paymentRequestsEnabled: true, issued, failed, pricingNotified, pricingNotifyFailed });
}
