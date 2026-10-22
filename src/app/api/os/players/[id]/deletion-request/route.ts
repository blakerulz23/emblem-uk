import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';
import { logRouteFailure, raised } from '@/lib/route-failure';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETION_REQUEST_FAILED_MESSAGE = 'Could not send the deletion request. Please try again.';

/**
 * Files a "Request player-data deletion" record — not immediate
 * self-serve deletion. A staff member reviews it via /staff/
 * deletion-requests and carries out the actual deletion using the
 * existing runbook (docs/pilot/child-data-deletion-runbook.md). Calls
 * request_player_deletion (0041, signature updated in 0044), a SECURITY
 * DEFINER RPC that does its own guardian-ownership check and is
 * idempotent — a second call while a request is already pending returns
 * the same request id rather than filing a duplicate.
 *
 * The caller's own email (already known from this route's own
 * getUser() call, never client-supplied) is passed through and snapshotted
 * onto the request row — see 0044's own comment for why: requested_by's
 * profile FK can go null if this guardian later deletes their account,
 * and staff still need a way to notify them once the request is done.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: requestId, error } = await supabase.rpc('request_player_deletion', {
    p_player_id: params.id,
    p_requester_email: user.email ?? null,
    p_notes: null,
  });
  // Database text never reaches the caller or the log.
  if (error) {
    if (raised(error, 'Not authenticated')) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    if (raised(error, 'Not authorized')) {
      return NextResponse.json({ error: 'Only a guardian can request deletion for this player' }, { status: 403 });
    }
    logRouteFailure('player deletion request', error);
    return NextResponse.json({ error: DELETION_REQUEST_FAILED_MESSAGE }, { status: 500 });
  }

  if (requestId) {
    await enqueueAndDispatchStaffNotification(createServiceRoleClient(), {
      eventType: 'deletion_request_filed',
      eventKey: `deletion_request_filed:${requestId}`,
      subjectId: requestId as string,
      recipientScope: 'all_staff',
      summary: { source: 'player' },
      linkPath: '/staff/deletion-requests',
    });
  }

  return NextResponse.json({ ok: true, requestId });
}
