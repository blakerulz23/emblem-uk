import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';

export const runtime = 'nodejs';

/**
 * Gate 3 — read-only payment-status poll for the "Confirming your
 * payment…" screen. The browser's own return from Shopify is never trusted
 * as proof of payment; this is what the "Order confirmed" screen actually
 * waits on, and it can only ever report what the last valid Shopify
 * webhook (apply_gate3_payment_event, service-role only) already recorded
 * server-side — this route itself never mutates anything.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'gate3-payment-status', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('get_gate3_payment_status', { p_order_id: params.id });
  if (error) {
    console.error('orders/payment-status:rpc', error.message);
    return NextResponse.json({ error: 'Status is not available for this order' }, { status: 400 });
  }

  const result = data as { ok: true; paymentStatus: string; authorityStatus: string | null } | { ok: false; reason: string } | null;
  if (!result?.ok) {
    return NextResponse.json({ error: 'Status is not available for this order' }, { status: 403 });
  }

  return NextResponse.json(
    { ok: true, paymentStatus: result.paymentStatus, authorityStatus: result.authorityStatus },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
