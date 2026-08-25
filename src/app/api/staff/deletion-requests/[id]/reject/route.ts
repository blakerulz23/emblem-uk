import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * Records that staff reviewed a player_deletion_requests row and declined
 * to act on it — e.g. couldn't verify the requester's identity. Performs
 * no deletion. Migration 0076: now routed entirely through
 * staff_reject_player_deletion_request (SECURITY DEFINER), not a raw
 * service-role UPDATE — a raw UPDATE would flip `status` correctly but
 * silently skip restore_after_player_deletion_request, leaving the
 * player's public profile disabled and their cards suspended forever even
 * though the request that caused that was just declined. The RPC does
 * both in one transaction.
 *
 * Requires a non-empty rejection reason — enforced here, by the RPC
 * itself, and by the table's own CHECK constraint (0041). Only a
 * currently-pending request can be rejected; re-rejecting an already-
 * rejected request is a safe no-op (the RPC's own idempotent branch).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
  }

  const { error } = await supabase.rpc('staff_reject_player_deletion_request', {
    p_request_id: params.id,
    p_rejection_reason: reason,
  });

  if (error) {
    if (error.message.includes('Staff access required')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message === 'Request not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
