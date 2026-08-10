import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * Records that a player_deletion_requests row was completed — staff have
 * already carried out the actual deletion by hand via the existing
 * runbook (docs/pilot/child-data-deletion-runbook.md); this route only
 * records that fact, it never performs the deletion itself.
 *
 * Requires a non-empty completion note (attestation, not just a click) —
 * enforced twice: here, and by the table's own
 * player_deletion_requests_completion_requires_attestation CHECK
 * constraint (0041), so this can never be bypassed by calling the DB
 * directly with a different code path either.
 *
 * Only a currently-pending request can be completed — checked here for a
 * clear error message, and independently enforced by the table's
 * player_deletion_requests_enforce_transition trigger (0041) regardless of
 * this check, since this route runs on the service-role client which has
 * no RLS to fall back on. Re-completing an already-completed request is a
 * safe no-op (idempotent retry); completing a rejected or cancelled
 * request is a genuine error — those are a different outcome, not a
 * duplicate of this one.
 *
 * Guardian notification ("your request has been completed") is manual in
 * this pass, using the requester_email snapshotted on the row (0044) —
 * not automated here.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!note) {
    return NextResponse.json({ error: 'A completion note is required.' }, { status: 400 });
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
  if (existing.status === 'completed') {
    return NextResponse.json({ ok: true });
  }
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `This request is already ${existing.status} and can no longer be completed.` }, { status: 400 });
  }

  const { error } = await serviceRole
    .from('player_deletion_requests')
    .update({
      status: 'completed',
      completed_by: staffCheck.userId,
      completed_at: new Date().toISOString(),
      completion_note: note,
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
