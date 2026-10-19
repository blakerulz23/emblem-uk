import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractOrderRef, extractShopifyOrderId, verifyShopifyHmac, verifyPaidLineItem } from '@/lib/shopify-webhook';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';
import { squadInviteVariantId } from '@/lib/squad-invite-payment-link';
import { notifyStaffOfPaymentIssue } from '@/lib/payment-alerts';
import { flagSecondPaymentIfAny } from '@/lib/duplicate-payment';

/**
 * Real money, currently invisible outside raw server logs — every failure
 * branch below used to be console.error-only, explicitly flagged in the
 * code as "for reconciliation" with no reconciliation view anywhere in the
 * app. Date-scoped per order_ref: a genuinely new failure for the SAME
 * order_ref later the same day (e.g. a duplicate delivery hitting a
 * different failure branch) still only notifies once — Shopify's own
 * retry behaviour on a webhook it saw return non-2xx could otherwise spam
 * this multiple times in quick succession.
 */
async function notifyStaffOfPaymentVerificationFailure(
  service: ReturnType<typeof createServiceRoleClient>,
  orderRef: string,
  reason: string,
): Promise<void> {
  await enqueueAndDispatchStaffNotification(service, {
    eventType: 'payment_verification_failed',
    eventKey: `payment_verification_failed:${orderRef}:${new Date().toISOString().slice(0, 10)}`,
    subjectId: null,
    recipientScope: 'all_staff',
    summary: { orderRef, reason },
    linkPath: '/staff/queue',
  });
}

export const runtime = 'nodejs';

/**
 * Shopify `orders/paid` webhook — replaces the manual `/staff/queue`
 * Approve step for the happy path. Does NOT create any orders/cards/
 * players rows: those already exist because /api/order-enquiry writes
 * them synchronously at submission time. The webhook's only job is
 * verifying and recording payment, exactly once, safely against replay.
 *
 * Gate 3 hardening on top of the original implementation:
 *   1. Signature verification (unchanged) happens before anything else.
 *   2. The webhook delivery id (X-Shopify-Webhook-Id) is threaded through
 *      to apply_gate3_payment_event (migration 0080), which inserts it
 *      into shopify_webhook_events inside the SAME transaction as the
 *      order update — a replayed delivery is a safe no-op regardless of
 *      what has happened to the order since, never re-derived from
 *      payment_status alone.
 *   3. The paid line item is verified against this order's own
 *      already-persisted pricing snapshot (unit_price_pence,
 *      total_print_quantity, currency) before anything is recorded as
 *      paid — never trusts total_price wholesale (see
 *      verifyPaidLineItem's own comment on why: Shopify's own checkout
 *      adds shipping/tax Emblem doesn't set).
 *
 * Setup: see docs/infra/shopify-webhook-setup.md for the Shopify Admin
 * side. Squad Invite orders are price-verified like builder orders (step 3)
 * and then use their own, separate mark_squad_invite_participation_paid
 * bookkeeping (unchanged).
 */
export async function POST(req: NextRequest) {
  // 1) HMAC verification, against the raw body — parsing to JSON first and
  //    re-stringifying would not match Shopify's signed bytes.
  const rawBody = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const isValid = verifyShopifyHmac(rawBody, hmacHeader, process.env.SHOPIFY_WEBHOOK_SECRET);
  if (!isValid) {
    // 401 (not 200) so a genuinely-misconfigured deployment surfaces as
    // repeated Shopify retries instead of silently swallowing everything.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const webhookId = req.headers.get('x-shopify-webhook-id');
  if (!webhookId) {
    // Every real Shopify webhook delivery carries this header. Its absence
    // means this request didn't genuinely come from Shopify's delivery
    // system even though (implausibly) the HMAC matched — fail closed
    // rather than process an event with no replay-safety anchor at all.
    return NextResponse.json({ error: 'missing webhook id' }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // 2) Extract our order_ref. Absent = this Shopify order didn't originate
  //    from our builder (e.g. a manually-created Admin order, a different
  //    integration on the same store). 200 so Shopify doesn't retry
  //    forever; log so we can spot patterns.
  const orderRef = extractOrderRef(payload);
  if (!orderRef) {
    console.warn('shopify webhook: orders/paid with no Order Ref attribute', { shopifyOrderId: extractShopifyOrderId(payload) });
    return NextResponse.json({ ok: true, note: 'no order_ref, ignored' });
  }

  const supabase = createServiceRoleClient();
  const { data: existing, error: lookupError } = await supabase
    .from('orders')
    .select('id, payment_status, source, unit_price_pence, total_print_quantity, currency')
    .eq('order_ref', orderRef)
    .maybeSingle();

  if (lookupError) {
    // Transient DB error — let Shopify retry with exponential backoff.
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!existing) {
    // Two possibilities: (a) rare race — order-enquiry still committing,
    // (b) real bug — this order_ref was never created. Return 200 either
    // way to avoid retry storms; a real bug shows up in reconciliation.
    console.warn('shopify webhook: no matching orders row', { orderRef });
    return NextResponse.json({ ok: true, note: 'no matching order' });
  }

  // 3) Verify the paid line item against this order's own authoritative
  //    pricing snapshot — never trust total_price wholesale. Builder orders
  //    are checked against NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT and the
  //    order's own snapshot; Squad Invite orders against their campaign's
  //    frozen tier and unit price, that tier's own variant, and the
  //    family's own print quantity (the same values their checkout link
  //    was built from). Both fail closed with a staff alert.
  let verifiedAmountPence: number | null = null;
  let verifiedCurrency: string | null = null;
  if (existing.source !== 'squad_invite') {
    const variantId = process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
    if (!variantId || existing.unit_price_pence == null || existing.total_print_quantity == null) {
      console.error('shopify webhook: cannot verify paid line item — pricing snapshot or variant missing', { orderRef });
      await notifyStaffOfPaymentVerificationFailure(supabase, orderRef, 'Pricing snapshot or variant configuration missing');
      return NextResponse.json({ ok: true, note: 'pricing snapshot unavailable, not applying' });
    }
    // Verified in the currency the customer paid (Shopify presentment currency), which must be this order's own snapshot currency.
    const verification = verifyPaidLineItem(payload, variantId, existing.total_print_quantity, existing.unit_price_pence, existing.currency || 'GBP');
    if (!verification.ok) {
      // Never applied — flagged loudly for reconciliation. 200 because
      // retrying won't change what Shopify actually charged.
      console.error('shopify webhook: paid line item verification failed', { orderRef, reason: verification.reason });
      await notifyStaffOfPaymentVerificationFailure(supabase, orderRef, `Paid line item verification failed: ${verification.reason}`);
      return NextResponse.json({ ok: true, note: 'verification failed, not applying' });
    }
    verifiedAmountPence = existing.unit_price_pence * existing.total_print_quantity;
    verifiedCurrency = verification.currency ?? existing.currency ?? null;
    if (existing.currency && verifiedCurrency && existing.currency !== verifiedCurrency) {
      console.error('shopify webhook: currency mismatch', { orderRef, expected: existing.currency, got: verifiedCurrency });
      await notifyStaffOfPaymentVerificationFailure(supabase, orderRef, `Currency mismatch — expected ${existing.currency}, got ${verifiedCurrency}`);
      return NextResponse.json({ ok: true, note: 'currency mismatch, not applying' });
    }
  } else {
    const { data: participation, error: participationError } = await supabase
      .from('squad_invite_participations')
      .select('print_quantity, squad_invites(final_tier, final_unit_price_pence)')
      .eq('order_id', existing.id)
      .maybeSingle();
    if (participationError) {
      // Transient DB error — let Shopify retry.
      return NextResponse.json({ error: participationError.message }, { status: 500 });
    }
    const campaignRaw = (participation as { squad_invites?: unknown } | null)?.squad_invites;
    const campaign = (Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw) as { final_tier?: string | null; final_unit_price_pence?: number | null } | null | undefined;
    const tier = campaign?.final_tier;
    const unitPricePence = campaign?.final_unit_price_pence;
    const printQuantity = (participation as { print_quantity?: number | null } | null)?.print_quantity;
    const variantId = tier === 'single' || tier === 'multi' || tier === 'squad' ? squadInviteVariantId(tier) : null;
    if (!variantId || unitPricePence == null || printQuantity == null) {
      console.error('shopify webhook: cannot verify Squad Invite payment — participation, final price or tier variant missing', { orderRef });
      await notifyStaffOfPaymentVerificationFailure(supabase, orderRef, 'Squad Invite final price, participation or tier variant missing');
      return NextResponse.json({ ok: true, note: 'squad invite pricing unavailable, not applying' });
    }
    const verification = verifyPaidLineItem(payload, variantId, printQuantity, unitPricePence, 'GBP');
    if (!verification.ok) {
      console.error('shopify webhook: Squad Invite paid line item verification failed', { orderRef, reason: verification.reason });
      await notifyStaffOfPaymentVerificationFailure(supabase, orderRef, `Squad Invite paid line item verification failed: ${verification.reason}`);
      return NextResponse.json({ ok: true, note: 'verification failed, not applying' });
    }
    verifiedAmountPence = unitPricePence * printQuantity;
    verifiedCurrency = verification.currency ?? 'GBP';
  }

  // 4) Exactly-once, idempotent state transition — migration 0080's
  //    apply_gate3_payment_event does the webhook-id dedup insert and the
  //    order update in one transaction.
  const { data: applied, error: applyError } = await supabase.rpc('apply_gate3_payment_event', {
    p_order_id: existing.id,
    p_shopify_event_id: webhookId,
    p_topic: 'orders/paid',
    p_to_status: 'paid',
    p_shopify_order_id: extractShopifyOrderId(payload),
    p_amount_pence: verifiedAmountPence,
    p_currency: verifiedCurrency,
  });

  if (applyError) {
    return NextResponse.json({ error: applyError.message }, { status: 500 });
  }

  const result = applied as { applied: boolean; reason?: string } | null;

  // A payment Shopify reports for an order Emblem already holds as
  // cancelled or refunded is never applied (apply_gate3_payment_event), but
  // money may have been taken, so staff are told.
  if (!result?.applied && (result?.reason === 'order_cancelled' || result?.reason === 'order_refunded')) {
    await notifyStaffOfPaymentIssue(supabase, {
      kind: 'paid_after_close',
      reference: orderRef,
      reason: `Shopify reports this order paid, but Emblem already holds it as ${result.reason === 'order_cancelled' ? 'cancelled' : 'refunded'}, so it was not marked paid. Check the order in Shopify and refund it if money was taken.`,
    });
  }

  // 4b) A second payment for an order Emblem already holds as paid (two
  //     Shopify checkouts completed for one order) is never silently
  //     ignored: recorded append-only and staff alerted with what to refund
  //     (duplicate-payment.ts). Also runs on a duplicate delivery, so an
  //     alert that failed to enqueue is retried; a redelivery of the payment
  //     already recorded stays silent. 500 asks Shopify to retry.
  if (!result?.applied && (result?.reason === 'already_paid' || result?.reason === 'duplicate_event')) {
    const outcome = await flagSecondPaymentIfAny(supabase, { orderId: existing.id, orderRef, payload, webhookId });
    if (outcome === 'failed') {
      console.error('shopify webhook: second payment could not be recorded or alerted, asking Shopify to retry', { orderRef });
      return NextResponse.json({ error: 'duplicate payment not yet recorded' }, { status: 500 });
    }
    if (outcome === 'flagged' && existing.source !== 'squad_invite') {
      return NextResponse.json({ ok: true, applied: false, reason: 'duplicate_payment_flagged', orderId: existing.id });
    }
  }

  // 5) Squad Invite bookkeeping — links this real payment to its
  //     participation and recomputes free-coach-card eligibility. Runs
  //     whenever the order is currently paid (applied now, or a retry of a
  //     delivery already applied), so a failure here is retried rather than
  //     lost: a database error returns 500 and Shopify's retry, arriving as
  //     a duplicate, runs it again. mark_squad_invite_participation_paid
  //     marks a family paid from any other status, so it is never called
  //     for an order that is refunded or cancelled.
  if (existing.source === 'squad_invite' && (result?.applied || result?.reason === 'duplicate_event' || result?.reason === 'already_paid')) {
    const { data: current, error: currentError } = await supabase.from('orders').select('payment_status').eq('id', existing.id).maybeSingle();
    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 500 });
    }
    const currentStatus = (current as { payment_status?: string } | null)?.payment_status;
    if (currentStatus === 'paid' || currentStatus === 'fulfilled') {
      const { error: coachCardError } = await supabase.rpc('mark_squad_invite_participation_paid', { p_order_id: existing.id });
      if (coachCardError) {
        console.error('shopify webhook: mark_squad_invite_participation_paid failed, asking Shopify to retry', { orderId: existing.id });
        return NextResponse.json({ error: coachCardError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, orderId: existing.id, applied: result?.applied ?? false, reason: result?.reason });
}

/**
 * GET is a lightweight liveness probe. Shopify's webhook config UI
 * doesn't call this — it's for our own uptime checks / manual verification
 * that the deployment picked up the new endpoint.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhooks/shopify/orders-paid',
    method: 'POST',
    verify: 'HMAC-SHA256 of raw body against SHOPIFY_WEBHOOK_SECRET, plus X-Shopify-Webhook-Id for exactly-once processing',
    setsPaymentStatus: 'paid',
  });
}
