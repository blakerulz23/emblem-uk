import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logRouteFailure, raised } from '@/lib/route-failure';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancels the caller's own pending team request. The database function
 * (cancel_own_coach_team_request) only ever touches a pending request whose
 * requester is auth.uid(), so another person's id simply isn't found.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Team request not found' }, { status: 404 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { error } = await supabase.rpc('cancel_own_coach_team_request', { p_request_id: params.id });
  if (error) {
    if (raised(error, 'No pending team request')) {
      return NextResponse.json({ error: 'Team request not found' }, { status: 404 });
    }
    if (raised(error, 'Not authenticated')) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    logRouteFailure('team request: cancel', error);
    return NextResponse.json({ error: 'Could not cancel your team request. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
