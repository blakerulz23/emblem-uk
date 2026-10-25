import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyRefund, refundTouchesVariants, verifyShopifyHmac } from '@/lib/shopify-webhook';
import { squadInviteVariantId } from '@/lib/squad-invite-payment-link';
import { notifyStaffOfPaymentIssue } from '@/lib/payment-alerts';
import { recordDuplicateRefund } from '@/lib/duplicate-payment';

export const runtime = 'nodejs';

/** Every Shopify variant Emblem UK sells cards on: the single card plus the three Squad Invite tiers. */
function emblemCardVariantIds(): string[] {
  return [
    process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT,
    squadInviteVariantId('single'),
    squadInviteVariantId('multi'),
    squadInviteVariantId('squad'),
  ].filter((v): v is string => Boolean(v));
}

/**
 * Shopify `refunds/create` webhook — Gate 3 safe handling for a refund.
 *
 * A Refund payload is a different shape from an Order payload: it carries
 * `order_id` (Shopify's own order id) directly, never `note_attributes`
 * (those live on the Order object, not the Refund object) — so this route
 * looks orders up by `shopify_order_id` (only ever written once
 * orders/paid's own line-item-verified payment already recorded it), not
 * by `order_ref` the way the other two webhook routes do.
 *
 * The refund is classified against what Emblem recorded as paid
 * (classifyRefund): only a refund covering every paid card moves the order
 * to `refunded`; partial, items-only and failed refunds leave it paid and
 * alert staff. For a Squad Invite order the family's participation then
 * moves from paid to refunded and the campaign's paid-family count and
 * free coach card are recomputed (reconcile_squad_invite_coach_eligibility).
 * That sync runs on every delivery while the order is refunded, including
 * Shopify's retries of a delivery already applied, and returns 500 on a
 * database error so Shopify retries until it has run.
 *
 * Requires a real webhook subscription registered in Shopify Admin for
 * this topic pointed at this route.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!verifyShopifyHmac(rawBody, hmacHeader, process.env.SHOPIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const webhookId = req.headers.get('x-shopify-webhook-id');
  if (!webhookId) {
    return NextResponse.json({ error: 'missing webhook id' }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const shopifyOrderId = (payload as { order_id?: number | string })?.order_id;
  if (shopifyOrderId === undefined || shopifyOrderId === null) {
    return NextResponse.json({ ok: true, note: 'no order_id, ignored' });
  }

  const supabase = createServiceRoleClient();
  const { data: existing, error: lookupError } = await supabase
    .from('orders')
    .select('id, order_ref, payment_status, source, total_print_quantity, paid_amount_pence')
    .eq('shopify_order_id', String(shopifyOrderId))
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    // The refund of a second payment staff were alerted about (see
    // duplicate-payment.ts): recorded against its Emblem order, which keeps
    // its original payment.
    const duplicate = await recordDuplicateRefund(supabase, { shopifyOrderId: String(shopifyOrderId), webhookId });
    if (duplicate === 'failed') {
      return NextResponse.json({ error: 'duplicate refund not yet recorded' }, { status: 500 });
    }
    if (duplicate) {
      return NextResponse.json({ ok: true, orderId: duplicate.orderId, applied: false, reason: 'duplicate_payment_refunded' });
    }
    // Usually a refund on another product sold on the same store. If it
    // names one of our own card variants, Emblem never recorded this order
    // as paid (orders/paid missing or not yet processed) — a payment could
    // still be applied later from an older snapshot, so staff need to know.
    if (refundTouchesVariants(payload, emblemCardVariantIds())) {
      await notifyStaffOfPaymentIssue(supabase, {
        kind: 'refund_unmatched',
        reference: `shopify-order-${shopifyOrderId}`,
        reason: `Refund received for an Emblem card on Shopify order ${shopifyOrderId}, which Emblem has not recorded as paid. Check the order in Shopify and do not approve it if it is later marked paid.`,
      });
    }
    return NextResponse.json({ ok: true, note: 'no matching order' });
  }

  const reference = existing.order_ref ?? existing.id;
  const isSquadInvite = existing.source === 'squad_invite';

  // What Emblem recorded as paid: the family's own print quantity for a
  // Squad Invite order, the order's snapshot quantity otherwise.
  let paidQuantity: number | null = existing.total_print_quantity ?? null;
  if (isSquadInvite) {
    const { data: participation, error: participationError } = await supabase
      .from('squad_invite_participations')
      .select('print_quantity')
      .eq('order_id', existing.id)
      .maybeSingle();
    if (participationError) {
      return NextResponse.json({ error: participationError.message }, { status: 500 });
    }
    paidQuantity = (participation as { print_quantity?: number } | null)?.print_quantity ?? null;
  }

  const classification = classifyRefund(payload, {
    cardVariantIds: emblemCardVariantIds(),
    paidQuantity,
    paidAmountPence: existing.paid_amount_pence ?? null,
    currency: 'GBP',
  });

  if (classification.kind === 'failed') {
    await notifyStaffOfPaymentIssue(supabase, {
      kind: 'refund_failed',
      reference,
      reason: 'Shopify reports this refund failed, so no money was returned. The order is still recorded as paid; check the refund in Shopify.',
    });
    return NextResponse.json({ ok: true, orderId: existing.id, applied: false, reason: 'refund_failed' });
  }

  // Refunded cards earn nothing: a full refund, or a partial one that
  // returned money for any card, voids a pending partner commission for
  // this order (migration 0095; a no-op when the order wasn't credited). A
  // goodwill or shipping-only amount, or a restock with no money returned,
  // leaves it. Squad Invite orders never take a partner code, so they're
  // skipped. 500 asks Shopify to retry.
  const refundedCards = classification.kind === 'full'
    || (classification.refundedQuantity > 0 && classification.refundedAmountPence !== 0);
  if (!isSquadInvite && refundedCards) {
    const { error: voidError } = await supabase.rpc('void_uk_partner_commission', { p_order_id: existing.id, p_reason: 'refunded' });
    if (voidError) {
      console.error('shopify refund webhook: partner commission not voided, asking Shopify to retry', { reference });
      return NextResponse.json({ error: 'partner commission not yet voided' }, { status: 500 });
    }
  }

  if (classification.kind === 'partial') {
    await notifyStaffOfPaymentIssue(supabase, {
      kind: 'refund_partial',
      reference,
      reason: `Partial refund (${classification.refundedQuantity} card(s), ${classification.refundedAmountPence === null ? 'amount in another currency' : `£${(classification.refundedAmountPence / 100).toFixed(2)}`}). The order is still recorded as paid and still counts; refund the card in full in Shopify if it should not be printed.`,
    });
    return NextResponse.json({ ok: true, orderId: existing.id, applied: false, reason: 'partial_refund' });
  }

  const { data: applied, error: applyError } = await supabase.rpc('apply_gate3_payment_event', {
    p_order_id: existing.id,
    p_shopify_event_id: webhookId,
    p_topic: 'refunds/create',
    p_to_status: 'refunded',
    p_shopify_order_id: String(shopifyOrderId),
  });

  if (applyError) {
    return NextResponse.json({ error: applyError.message }, { status: 500 });
  }

  const result = applied as { applied: boolean; reason?: string } | null;

  if (result?.applied && existing.payment_status === 'fulfilled') {
    await notifyStaffOfPaymentIssue(supabase, {
      kind: 'refund_after_approval',
      reference,
      reason: 'Refunded in full after it was approved for production. Stop printing or posting this card.',
    });
  }

  // Squad Invite: the family no longer counts as paid. Idempotent, and run
  // whenever the order is refunded (applied now, or a retry of an already
  // applied delivery), so a failure here is retried rather than lost.
  if (isSquadInvite) {
    const { data: current } = await supabase.from('orders').select('payment_status').eq('id', existing.id).maybeSingle();
    if ((current as { payment_status?: string } | null)?.payment_status === 'refunded') {
      const { data: moved, error: moveError } = await supabase
        .from('squad_invite_participations')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('order_id', existing.id)
        .in('status', ['paid', 'production_accepted'])
        .select('campaign_id');
      if (moveError) {
        return NextResponse.json({ error: moveError.message }, { status: 500 });
      }
      let campaignId = (moved as { campaign_id: string }[] | null)?.[0]?.campaign_id;
      if (!campaignId) {
        const { data: participation } = await supabase.from('squad_invite_participations').select('campaign_id').eq('order_id', existing.id).maybeSingle();
        campaignId = (participation as { campaign_id?: string } | null)?.campaign_id;
      }
      if (campaignId) {
        const { error: reconcileError } = await supabase.rpc('reconcile_squad_invite_coach_eligibility', { p_campaign_id: campaignId });
        if (reconcileError) {
          return NextResponse.json({ error: reconcileError.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, orderId: existing.id, applied: result?.applied ?? false, reason: result?.reason });
}
