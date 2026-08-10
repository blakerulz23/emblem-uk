import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * Records that staff reviewed a player_deletion_requests row and declined
 * to act on it — e.g. couldn't verify the requester's identity. Performs
 * no deletion, same as complete/route.ts; this is the other of the two
 * ways a pending request can be closed out.
 *
 * Requires a non-empty rejection reason — enforced here and by the table's
 * own player_deletion_requests_rejection_requires_reason CHECK constraint
 * (0041).
 *
 * Only a currently-pending request can be rejected — checked here for a
 * clear error message, and independently enforced by the table's
 * player_deletion_requests_enforce_transition trigger regardless of this
 * check. Re-rejecting an already-rejected request is a safe no-op;
 * rejecting a completed or cancelled request is a genuine error.
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

  const serviceRole = createServiceRoleClient();
  const { data: existing, error: fetchError } = await serviceRole
    .from('player_deletion_requests')
    .select('status')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  if (existing.status === 'rejected') {
    return NextResponse.json({ ok: true });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `This request is already ${existing.status} and can no longer be rejected.` }, { status: 400 });
  }

  const { error } = await serviceRole
    .from('player_deletion_requests')
    .update({
      status: 'rejected',
      handled_by: staffCheck.userId,
      handled_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
