import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractOrderRef, verifyShopifyHmac } from '@/lib/shopify-webhook';

export const runtime = 'nodejs';

/**
 * Shopify `orders/paid` webhook — replaces the manual `/staff/queue` Approve
 * step for the happy path. Does NOT create any orders/cards/players rows:
 * those already exist because `/api/orders/intent` writes them synchronously
 * before the Shopify redirect (per Claimable Cards primer § 04). The
 * webhook's job is one atomic status update, duplicate-safe.
 *
 * Setup: see docs/infra/shopify-webhook-setup.md for the Shopify Admin side.
 *
 * Decision C (Checkout Rebuild Decision Log): this handler sets
 * `payment_status = 'paid'`. `'fulfilled'` is reserved for a real shipping
 * event (not a payment event). The existing manual approve endpoint at
 * /api/orders/[id]/approve currently sets 'fulfilled' — that's a legacy
 * behaviour flagged for change once Blake signs off on Decision C. Both
 * approaches remain safe during the parallel-run rollout period because
 * the idempotency check below treats 'paid' and 'fulfilled' as equally
 * "already past the webhook's job."
 */
export async function POST(req: NextRequest) {
  // 1) HMAC verification. Must happen against the raw body — parsing to JSON
  //    first and re-stringifying would (a) round-trip whitespace/key order
  //    and (b) not match Shopify's signed bytes.
  const rawBody = await req.text();
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  const isValid = verifyShopifyHmac(rawBody, hmacHeader, process.env.SHOPIFY_WEBHOOK_SECRET);
  if (!isValid) {
    // 401 (not 200) so a genuinely-misconfigured deployment surfaces as
    // repeated Shopify retries instead of silently swallowing everything.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
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
    const shopifyOrderId = (payload as { id?: number | string })?.id;
    console.warn('shopify webhook: orders/paid with no Order Ref attribute', { shopifyOrderId });
    return NextResponse.json({ ok: true, note: 'no order_ref, ignored' });
  }

  // 3) Look up our row.
  const supabase = createServiceRoleClient();
  const { data: existing, error: lookupError } = await supabase
    .from('orders')
    .select('id, payment_status')
    .eq('order_ref', orderRef)
    .maybeSingle();

  if (lookupError) {
    // Transient DB error — let Shopify retry with exponential backoff.
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!existing) {
    // Two possibilities: (a) rare race — /api/orders/intent still committing,
    // (b) real bug — this order_ref was never created. Return 200 either way
    // to avoid retry storms; a real bug will show up in reconciliation, a
    // race is harmless because the manual approve path still exists.
    console.warn('shopify webhook: no matching orders row', { orderRef });
    return NextResponse.json({ ok: true, note: 'no matching order' });
  }

  // 4) Idempotency — safe no-op if we've already moved past this state.
  //    Includes 'fulfilled' during the transition period where legacy
  //    manual-approved orders sit at that status (see class comment above).
  if (existing.payment_status === 'paid' || existing.payment_status === 'fulfilled') {
    return NextResponse.json({ ok: true, note: 'already past paid' });
  }
  if (existing.payment_status === 'cancelled') {
    // Cancelled orders shouldn't be re-flipped to paid by a late webhook.
    // Flag for staff review, don't touch the row.
    console.warn('shopify webhook: paid event for cancelled order', { orderRef });
    return NextResponse.json({ ok: true, note: 'order cancelled, not updating' });
  }

  // 5) Flip to 'paid' (Decision C).
  const { error: updateError } = await supabase
    .from('orders')
    .update({ payment_status: 'paid' })
    .eq('id', existing.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 6) TODO(Phase 4 outbox): emit order.paid event here once the outbox
  //    exists per ADR-3. TODO(Phase 6a invitation orchestrator): once
  //    that ships, this is where its trigger fires — reads
  //    orders.intended_guardian_email, calls createGuardianInvite().

  return NextResponse.json({ ok: true, orderId: existing.id });
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
    verify: 'HMAC-SHA256 of raw body against SHOPIFY_WEBHOOK_SECRET',
    setsPaymentStatus: 'paid',
  });
}
