import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { buildUkCardCartUrl, gate3CheckoutSupportsTier, isSafeShopifyCheckoutUrl } from '@/lib/shopify';

export const runtime = 'nodejs';

/**
 * Gate 3 — direct Shopify checkout creation.
 *
 * Never accepts a price, quantity, variant, success URL, or order owner
 * from the browser — the only input is the order id in the URL path. Every
 * other value comes from begin_gate3_checkout (migration 0080), which
 * re-verifies the caller is the declaring adult, that authority is
 * confirmed, that the order hasn't already been paid, and returns the
 * order's own already-persisted, server-computed pricing snapshot. The
 * cart-permalink URL is built here from that snapshot only — never from
 * anything the request body could supply (this route ignores its body
 * entirely).
 *
 * Only the single-child pricing tier is wired up today — see
 * gate3CheckoutSupportsTier's own comment on why multi/squad orders are
 * refused with a clear error instead of silently checking out through the
 * wrong variant/price.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidBuilderCsrf(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'gate3-checkout-create', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('begin_gate3_checkout', { p_order_id: params.id });
  if (error) {
    console.error('orders/checkout:rpc', error.message);
    return NextResponse.json({ error: 'Checkout is not available for this order' }, { status: 400 });
  }

  const result = data as
    | { ok: true; orderRef: string; pricingTier: string; quantity: number; unitPricePence: number; subtotalPence: number; currency: string }
    | { ok: false; reason: string }
    | null;

  if (!result?.ok) {
    const reason = result?.reason;
    // Every "not this caller's order" style reason collapses to the same
    // 403 with the same generic message — never lets a caller distinguish
    // "wrong order" from "not yours" from "doesn't exist".
    if (reason === 'not_authenticated' || reason === 'not_authorized') {
      return NextResponse.json({ error: 'Checkout is not available for this order' }, { status: 403 });
    }
    if (reason === 'already_paid') {
      return NextResponse.json({ error: 'This order has already been paid for' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Checkout is not available for this order' }, { status: 409 });
  }

  if (!gate3CheckoutSupportsTier(result.pricingTier)) {
    // Phase 7: stop and report rather than construct a checkout against an
    // unresolved product/variant mapping. Logged with the tier only —
    // never the order id, ref, or any customer detail.
    console.error('orders/checkout: unresolved Shopify variant mapping for pricing tier', result.pricingTier);
    return NextResponse.json({ error: 'Secure checkout is not yet available for this order type — please contact us' }, { status: 503 });
  }

  const checkoutUrl = buildUkCardCartUrl(result.quantity, result.orderRef);
  if (!checkoutUrl) {
    return NextResponse.json({ error: 'Secure checkout is not configured yet — please contact us' }, { status: 503 });
  }

  // Defence in depth — never return a URL that isn't genuinely Shopify's
  // own hosted cart on this app's configured shop. See
  // isSafeShopifyCheckoutUrl's own comment: this can't actually fail
  // today given how buildUkCardCartUrl is implemented, but it means this
  // route can never regress into forwarding an arbitrary URL without a
  // loud, immediate failure here.
  if (!isSafeShopifyCheckoutUrl(checkoutUrl)) {
    console.error('orders/checkout: refusing to return a URL that failed Shopify-host validation');
    return NextResponse.json({ error: 'Could not prepare secure checkout — please try again' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checkoutUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
