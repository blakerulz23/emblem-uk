import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isUuid } from '@/lib/test-archive';

export const runtime = 'nodejs';

/**
 * Hides a refunded or cancelled internal test order (for example one with
 * Shopify payment history) from the staff queues. hide_financial_test_order
 * (migration 0088) requires the order's short reference typed back and only
 * sets archive flags: payment fields, payment events, webhook records and
 * Squad Invite rows are never updated or deleted.
 */
export async function POST(request: Request) {
  const staff = await requireSquadInvitePermission(createClient(), 'test_data_admin');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

  const body = (await request.json().catch(() => null)) as { orderId?: unknown; typedOrderRef?: unknown; reason?: unknown } | null;
  if (!isUuid(body?.orderId)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  const typedOrderRef = typeof body?.typedOrderRef === 'string' ? body.typedOrderRef.trim() : '';
  if (!typedOrderRef) return NextResponse.json({ error: 'Type the order reference to confirm' }, { status: 400 });
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3) return NextResponse.json({ error: 'A reason is required' }, { status: 400 });

  const { data, error } = await createServiceRoleClient().rpc('hide_financial_test_order', {
    p_order_id: body!.orderId, p_typed_order_ref: typedOrderRef, p_actor: staff.userId, p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message || 'Order could not be hidden' }, { status: 409 });
  return NextResponse.json({ ok: true, result: data });
}
