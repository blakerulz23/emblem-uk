import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

export const runtime = 'nodejs';

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

  const { data: requestId, error } = await supabase.rpc('request_player_deletion', {
    p_player_id: params.id,
    p_requester_email: user.email ?? null,
    p_notes: null,
  });
  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Only a guardian can request deletion for this player' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
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
