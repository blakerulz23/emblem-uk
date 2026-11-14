import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { logRouteFailure, raised } from '@/lib/route-failure';
import { removeAccountSignIn } from '@/lib/remove-account-sign-in';
import { COMPLETE_CONFIRMATION, validateStaffReason } from '@/lib/staff-account-deletion';
import { isSafeStaffPost } from '@/lib/staff-account-deletion-request';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Completes a reviewed account deletion permanently (migration 0097,
 * complete_pending_profile_deletion), then removes the sign-in.
 *
 * - Authorization: same-origin JSON request from the real signed-in staff
 *   account (requireStaff); the database function runs in that same session,
 *   so auth.uid() is the staff member. No actor id is ever taken from the body.
 * - The database function runs the full 0076 clean-up exactly once, marks
 *   attribution, records the account as erased (the middleware then refuses
 *   its sessions; no profile can be recreated), audits the decision once, and
 *   queues the Auth user in pending_auth_deletions.
 * - Only the call that actually completed it then bans and deletes the Auth
 *   user (service role, server-side) and records that outcome in the audit.
 *   A repeated or concurrent second call gets already_completed and touches
 *   nothing: no clean-up, no Auth call, no audit row. A failed sign-in removal
 *   is retried with .../retry-sign-in, never by completing again.
 */
const MESSAGES: Array<[string, number, string]> = [
  ['Not authenticated', 401, 'Sign in required'],
  ['Not authorized: staff only', 403, 'Staff access required'],
  ['A reason (up to 500 characters) is required', 400, 'Enter a reason (up to 500 characters).'],
  ['Pending profile deletion not found', 404, 'Deletion request not found.'],
  ['Only a pending profile deletion can be completed', 409, 'This request is no longer pending (it may have been rejected). Refresh the page.'],
  ['marked resolved but a profile with this id exists', 409, 'This request was closed without deleting the account. Nothing was changed.'],
  ['Staff accounts are removed by the manual staff procedure', 409, 'This is a staff account. Staff access must be removed through the two-person manual procedure first.'],
  ['still has records that block deletion', 409, 'Records that must be kept still block this deletion. Resolve them first; nothing was changed.'],
];
export const RESULT_UNKNOWN = 'The result could not be confirmed. Refresh the page: if the request is still waiting, nothing was changed.';

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
  if (body?.confirm !== COMPLETE_CONFIRMATION) {
    return NextResponse.json({ error: 'Confirm that this deletion is permanent.' }, { status: 400 });
  }

  const { data, error } = await session.rpc('complete_pending_profile_deletion', {
    p_pending_deletion_id: params.id,
    p_reason: reason,
  });
  if (error) {
    for (const [fragment, status, message] of MESSAGES) {
      if (raised(error, fragment)) return NextResponse.json({ error: message }, { status });
    }
    // Not one of the function's own refusals: possibly a lost connection after
    // the database committed, so never claim that nothing changed.
    logRouteFailure('staff account deletion: complete', error);
    return NextResponse.json({ error: RESULT_UNKNOWN }, { status: 500 });
  }

  const result = (data ?? {}) as { status?: string; profileId?: string; playersUnlinked?: unknown[]; playersDeletionRequested?: unknown[] };
  if (!result.profileId || !['completed', 'already_completed', 'account_already_deleted'].includes(result.status ?? '')) {
    logRouteFailure('staff account deletion: unexpected result');
    return NextResponse.json({ error: RESULT_UNKNOWN }, { status: 500 });
  }

  const service = createServiceRoleClient();
  if (result.status === 'already_completed') {
    const { data: queued } = await service
      .from('pending_auth_deletions')
      .select('status')
      .eq('auth_user_id', result.profileId)
      .eq('status', 'pending')
      .maybeSingle();
    return NextResponse.json({ ok: true, state: 'already_completed', signIn: queued ? 'removal_pending' : 'removed', partial: !!queued });
  }

  const signIn = await removeAccountSignIn(service, result.profileId, staff.userId);
  const { error: auditError } = await session.rpc('record_account_sign_in_removal', {
    p_pending_deletion_id: params.id,
    p_reason: reason,
    p_outcome: signIn.state,
  });
  if (auditError) logRouteFailure('staff account deletion: record sign-in removal', auditError);

  return NextResponse.json({
    ok: true,
    state: result.status,
    signIn: signIn.state,
    signInBlocked: signIn.state === 'removed' || signIn.banned,
    partial: signIn.state !== 'removed',
    childrenUnlinked: Array.isArray(result.playersUnlinked) ? result.playersUnlinked.length : 0,
    childDeletionRequests: Array.isArray(result.playersDeletionRequested) ? result.playersDeletionRequested.length : 0,
  });
}
