import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractOrderRef, extractShopifyOrderId, verifyShopifyHmac, verifyPaidLineItem } from '@/lib/shopify-webhook';

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
 * side. Squad Invite orders continue to use their own, separate
 * mark_squad_invite_participation_paid bookkeeping (unchanged, still
 * fired unconditionally as a safe no-op for every non-Squad-Invite order).
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
  //    pricing snapshot — never trust total_price wholesale. Squad Invite
  //    orders use their own variants (not NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT)
  //    and their own separate payment RPC, so this verification only ever
  //    applies to the ordinary-builder path.
  let verifiedAmountPence: number | null = null;
  let verifiedCurrency: string | null = null;
  if (existing.source !== 'squad_invite') {
    const variantId = process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
    if (!variantId || existing.unit_price_pence == null || existing.total_print_quantity == null) {
      console.error('shopify webhook: cannot verify paid line item — pricing snapshot or variant missing', { orderRef });
      return NextResponse.json({ ok: true, note: 'pricing snapshot unavailable, not applying' });
    }
    const verification = verifyPaidLineItem(payload, variantId, existing.total_print_quantity, existing.unit_price_pence);
    if (!verification.ok) {
      // Never applied — flagged loudly for reconciliation. 200 because
      // retrying won't change what Shopify actually charged.
      console.error('shopify webhook: paid line item verification failed', { orderRef, reason: verification.reason });
      return NextResponse.json({ ok: true, note: 'verification failed, not applying' });
    }
    verifiedAmountPence = existing.unit_price_pence * existing.total_print_quantity;
    verifiedCurrency = verification.currency ?? existing.currency ?? null;
    if (existing.currency && verifiedCurrency && existing.currency !== verifiedCurrency) {
      console.error('shopify webhook: currency mismatch', { orderRef, expected: existing.currency, got: verifiedCurrency });
      return NextResponse.json({ ok: true, note: 'currency mismatch, not applying' });
    }
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

  // 5) Squad Invite bookkeeping — links this real payment to its
  //     participation and recomputes free-coach-card eligibility. A no-op
  //     for every other order. Never lets a failure here affect the
  //     response — the payment itself already succeeded above.
  if (result?.applied && existing.source === 'squad_invite') {
    const { error: coachCardError } = await supabase.rpc('mark_squad_invite_participation_paid', { p_order_id: existing.id });
    if (coachCardError) console.warn('shopify webhook: mark_squad_invite_participation_paid failed', { orderId: existing.id });
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
