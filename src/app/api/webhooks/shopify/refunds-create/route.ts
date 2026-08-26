import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyShopifyHmac } from '@/lib/shopify-webhook';

export const runtime = 'nodejs';

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
    .select('id')
    .eq('shopify_order_id', String(shopifyOrderId))
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    // No order was ever recorded paid against this Shopify order id — most
    // likely a refund on an order this system never touched (a different
    // integration on the same store). 200 so Shopify doesn't retry forever.
    return NextResponse.json({ ok: true, note: 'no matching order' });
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
  return NextResponse.json({ ok: true, orderId: existing.id, applied: result?.applied ?? false, reason: result?.reason });
}
