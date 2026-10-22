import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logRouteFailure, raised } from '@/lib/route-failure';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETION_CANCEL_FAILED_MESSAGE = 'Could not cancel the deletion request. Please try again.';

/**
 * Withdraws the calling guardian's own pending "Request player-data
 * deletion" for this player — Account Settings' "Cancel deletion request"
 * action. Calls cancel_own_player_deletion_request (0041), a SECURITY
 * DEFINER RPC that independently re-checks auth.uid() and the guardian
 * relationship itself (never trusts this route's own session check alone)
 * and is idempotent on an already-cancelled request. Performs no deletion
 * of any kind — the request row itself becomes the audit record of the
 * withdrawal, it is never removed.
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

  const { error } = await supabase.rpc('cancel_own_player_deletion_request', { p_player_id: params.id });
  // Database text never reaches the caller or the log.
  if (error) {
    if (raised(error, 'Not authenticated')) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    if (raised(error, 'Not authorized')) {
      return NextResponse.json({ error: 'Only a guardian can cancel this deletion request' }, { status: 403 });
    }
    if (raised(error, 'No cancellable deletion request found')) {
      return NextResponse.json({ error: 'No pending deletion request to cancel' }, { status: 404 });
    }
    logRouteFailure('player deletion request cancel', error);
    return NextResponse.json({ error: DELETION_CANCEL_FAILED_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
