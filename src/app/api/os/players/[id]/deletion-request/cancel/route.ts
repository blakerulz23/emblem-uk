import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

  const { error } = await supabase.rpc('cancel_own_player_deletion_request', { p_player_id: params.id });
  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Only a guardian can cancel this deletion request' }, { status: 403 });
    }
    if (error.message.includes('No cancellable deletion request found')) {
      return NextResponse.json({ error: 'No pending deletion request to cancel' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
