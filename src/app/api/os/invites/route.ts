import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * An existing guardian or coach of a player generates an invite for a
 * second guardian. RLS ("player_invites: guardians/coaches can create for
 * their player/team") does the authorization — this route just calls the
 * shared invite-creation logic (the same one the no-card recovery flow's
 * "send to the right parent" outcome uses).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { playerId, invitedEmail, origin } = body as {
    playerId?: string;
    invitedEmail?: string;
    origin?: 'second_guardian' | 'coach_added_player';
  };
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }

  const result = await createGuardianInvite(
    supabase,
    playerId,
    user.id,
    invitedEmail,
    origin === 'coach_added_player' ? 'coach_added_player' : 'second_guardian'
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, code: result.code });
}
