import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Files a deletion request for one Squad Invite participation — the
 * parallel path to /api/os/players/[id]/deletion-request (migration
 * 0076), required because squad_invite_participations has no player_id
 * and is invisible to the player-deletion machinery until (if ever) it
 * commits. Authority is derived entirely from the RPC's own guardian_
 * profile_id = auth.uid() check against the specific participation row —
 * this route never trusts a client-supplied ownership claim.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data: requestId, error } = await supabase.rpc('request_squad_invite_participation_deletion', {
    p_participation_id: params.id,
    p_requester_email: user.email ?? null,
    p_notes: null,
  });
  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Only the guardian who committed this participation can request deletion' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, requestId });
}
