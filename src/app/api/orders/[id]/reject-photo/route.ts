import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * Content-moderation reject for a Squad Invite order's child photo —
 * closes DPIA risk R12. Gated on the same generic requireStaff tier as
 * order approval itself (approve/route.ts), not a new permission
 * concept — reviewable by any staff member for this pilot. All the real
 * logic (whole-order update, already-fulfilled guard, audit trail) lives
 * in the reject_squad_invite_card_photo RPC (migration 0063); this route
 * only authenticates and translates the RPC's exceptions into HTTP.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : null;

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.rpc('reject_squad_invite_card_photo', {
    p_order_id: params.id,
    p_staff_profile_id: staffCheck.userId,
    p_reason: reason,
  });

  if (error) {
    const message = error.message ?? 'This photo could not be rejected';
    const status = message.includes('not found') || message.includes('not linked') ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true, orderId: params.id, ...(data ?? {}) });
}
