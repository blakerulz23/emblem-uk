import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { isFreshSignIn, listRecoverableOrders } from '@/lib/unpaid-order-recovery';

export const runtime = 'nodejs';

/**
 * The signed-in adult's own unpaid direct orders, for "Pay for an order
 * you've already sent" (see unpaid-order-recovery.ts). Read-only: payment
 * resumes through the existing /api/orders/[id]/checkout. Needs a session
 * from an email code entered in the last 30 minutes; anything older answers
 * 401 { reason: 'verify' } so the page asks for a new code.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const { data: userData } = await createClient().auth.getUser();
  const user = userData?.user;
  if (!user) {
    return NextResponse.json({ error: 'Please verify your email', reason: 'verify' }, { status: 401 });
  }
  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'unpaid-order-recovery', user.id))) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429 });
  }
  if (!isFreshSignIn(user.last_sign_in_at)) {
    return NextResponse.json({ error: 'Please verify your email again', reason: 'verify' }, { status: 401 });
  }
  try {
    const orders = await listRecoverableOrders(createServiceRoleClient(), user.id);
    return NextResponse.json({ ok: true, orders }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('orders/unpaid: lookup failed', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'We couldn’t load your orders. Please try again.' }, { status: 503 });
  }
}
