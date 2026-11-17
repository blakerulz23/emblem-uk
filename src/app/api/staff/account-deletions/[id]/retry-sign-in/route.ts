import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { logRouteFailure } from '@/lib/route-failure';
import { removeAccountSignIn } from '@/lib/remove-account-sign-in';
import { validateStaffReason } from '@/lib/staff-account-deletion';
import { isSafeStaffPost } from '@/lib/staff-account-deletion-request';

export const runtime = 'nodejs';

/**
 * Retries removing the sign-in of an account whose deletion was already
 * completed and erased. Never deletes or erases anything else: it refuses
 * (changing nothing) unless the request is resolved AND the account is in
 * erased_accounts, so a request reopened under the same id (a new deletion
 * request) can never be completed from here. Each attempt is audited
 * (record_account_sign_in_removal, as the signed-in staff member).
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
  const { data: row, error: readError } = await service
    .from('pending_profile_deletions')
    .select('auth_user_id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readError) {
    logRouteFailure('staff account deletion: retry sign-in read', readError);
    return NextResponse.json({ error: 'Could not check this request. Nothing was changed. Please try again.' }, { status: 500 });
  }
  const req = row as { auth_user_id: string; status: string } | null;
  let erased = false;
  if (req?.status === 'resolved') {
    const { data: e } = await service.from('erased_accounts').select('profile_id').eq('profile_id', req.auth_user_id).maybeSingle();
    erased = !!e;
  }
  if (!req || !erased) {
    return NextResponse.json({ error: 'This request is not a completed deletion, so there is no sign-in to remove. Nothing was changed.' }, { status: 409 });
  }

  const signIn = await removeAccountSignIn(service, req.auth_user_id, staff.userId);
  const { error: auditError } = await session.rpc('record_account_sign_in_removal', {
    p_pending_deletion_id: params.id,
    p_reason: reason,
    p_outcome: signIn.state,
  });
  if (auditError) logRouteFailure('staff account deletion: record sign-in removal', auditError);

  return NextResponse.json({
    ok: true,
    state: 'already_completed',
    signIn: signIn.state,
    signInBlocked: signIn.state === 'removed' || signIn.banned,
    partial: signIn.state !== 'removed',
  });
}
