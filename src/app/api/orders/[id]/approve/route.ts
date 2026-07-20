import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * The one staff action that unblocks claiming for an order's cards — flips
 * an order to 'fulfilled'. A bare Shopify redirect or a submitted enquiry
 * is never itself proof of purchase (no webhook/Admin API access exists),
 * so this manual step is what actually makes a card's claim_token start
 * resolving as claimable. No staff-auth system exists in this app yet —
 * this page is already an unauthenticated "Internal · Staff only"
 * convention, matching how the rest of /staff/queue works today.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole
    .from('orders')
    .update({ payment_status: 'fulfilled' })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
