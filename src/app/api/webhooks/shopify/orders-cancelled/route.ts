import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { extractOrderRef, extractShopifyOrderId, verifyShopifyHmac } from '@/lib/shopify-webhook';

export const runtime = 'nodejs';

/**
 * Shopify `orders/cancelled` webhook — Gate 3 safe handling for a
 * cancelled order. Requires a real webhook subscription registered in
 * Shopify Admin for this topic (see docs/infra/shopify-webhook-setup.md)
 * pointed at this route; not registering it simply means cancellations
 * are never recorded automatically, not a security risk.
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

  const orderRef = extractOrderRef(payload);
  if (!orderRef) {
    return NextResponse.json({ ok: true, note: 'no order_ref, ignored' });
  }

  const supabase = createServiceRoleClient();
  const { data: existing, error: lookupError } = await supabase
    .from('orders')
    .select('id')
    .eq('order_ref', orderRef)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: true, note: 'no matching order' });
  }

  const { data: applied, error: applyError } = await supabase.rpc('apply_gate3_payment_event', {
    p_order_id: existing.id,
    p_shopify_event_id: webhookId,
    p_topic: 'orders/cancelled',
    p_to_status: 'cancelled',
    p_shopify_order_id: extractShopifyOrderId(payload),
  });

  if (applyError) {
    return NextResponse.json({ error: applyError.message }, { status: 500 });
  }

  const result = applied as { applied: boolean; reason?: string } | null;
  return NextResponse.json({ ok: true, orderId: existing.id, applied: result?.applied ?? false, reason: result?.reason });
}
