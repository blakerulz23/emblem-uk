import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { logRouteFailure, raised } from '@/lib/route-failure';
import { validateStaffReason } from '@/lib/staff-account-deletion';
import { isSafeStaffPost } from '@/lib/staff-account-deletion-request';

export const runtime = 'nodejs';

/**
 * Rejects a reviewed account deletion and restores exactly the coaching
 * access suspended for the review (migration 0098:
 * reject_pending_profile_deletion, then
 * restore_coach_access_after_deletion_rejection). Nothing else changed
 * during the review, so nothing else needs restoring.
 *
 * Both functions are service_role-only and take the staff member's id; that
 * id is the one requireStaff verified from the signed-in session, never a
 * value from the request. Both are idempotent and audited once, so calling
 * this again (the page's "Retry restore") after a restore that failed just
 * restores what is still open.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSafeStaffPost(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const session = createClient();
  const staff = await requireStaff(session);
  if (!staff.ok) {
    return NextResponse.json({ error: staff.error }, { status: staff.status });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const reasonError = validateStaffReason(reason);
  if (reasonError) {
    return NextResponse.json({ error: reasonError }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const args = { p_pending_deletion_id: params.id, p_staff_profile_id: staff.userId, p_reason: reason };

  // "Retry restore" for a request already rejected: restore only. The database
  // refuses unless the request is still rejected, so a stale page can never
  // reject a newer request that reopened under the same id.
  const restoreOnly = body?.mode === 'restore-only';
  let rejected: unknown = 'already_rejected';
  if (!restoreOnly) {
    const { data, error: rejectError } = await service.rpc('reject_pending_profile_deletion', args);
    rejected = data;
    if (rejectError) {
      if (raised(rejectError, 'Not authorized: staff only')) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
      if (raised(rejectError, 'Pending profile deletion not found')) return NextResponse.json({ error: 'Deletion request not found.' }, { status: 404 });
      if (raised(rejectError, 'This profile deletion is already')) {
        return NextResponse.json({ error: 'This request has already been decided and cannot be rejected.' }, { status: 409 });
      }
      logRouteFailure('staff account deletion: reject', rejectError);
      return NextResponse.json({ error: 'The result could not be confirmed. Refresh the page: if the request is still waiting, nothing was changed.' }, { status: 500 });
    }
  }

  const { data: restored, error: restoreError } = await service.rpc('restore_coach_access_after_deletion_rejection', args);
  if (restoreError) {
    if (raised(restoreError, 'Coach access can be restored only after the deletion is rejected')) {
      return NextResponse.json({ error: 'This request is no longer rejected (a new deletion request may have reopened it). Refresh the page; nothing was changed.' }, { status: 409 });
    }
    logRouteFailure('staff account deletion: restore', restoreError);
    return NextResponse.json(
      { ok: false, rejected: true, error: 'The request was rejected, but coaching access could not be restored. Try again to restore it.' },
      { status: 500 }
    );
  }

  const r = (restored ?? {}) as { restored?: number; notRestorable?: number };
  return NextResponse.json({
    ok: true,
    state: rejected === 'already_rejected' ? 'already_rejected' : 'rejected',
    coachingRestored: r.restored ?? 0,
    coachingNotRestorable: r.notRestorable ?? 0,
  });
}
