import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createGuardianInvite } from '@/lib/create-guardian-invite';
import type { InviteOrigin } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

/**
 * An existing guardian or coach of a player generates an invite for a
 * second guardian, or resends the one already outstanding. RLS
 * ("player_invites: guardians/coaches can create for their player/team")
 * does the authorization — this route just calls the shared
 * invite-creation logic (the same one the no-card recovery flow's "send
 * to the right parent" outcome uses).
 *
 * `resend: true` never accepts an email from the client — it looks up
 * whatever's already on file for the current live invite itself, so a
 * guardian's/prospective guardian's email never needs to round-trip
 * through the browser just to resend. Requires an existing live invite
 * with an email on it; a fresh "Invite guardian" call is what the coach
 * uses for a player that never had one, or one whose invite expired.
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
  const { playerId, invitedEmail, origin, resend } = body as {
    playerId?: string;
    invitedEmail?: string;
    origin?: 'second_guardian' | 'coach_added_player';
    resend?: boolean;
  };
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }

  let emailToUse = invitedEmail;
  let originToUse: InviteOrigin = origin === 'coach_added_player' ? 'coach_added_player' : 'second_guardian';

  if (resend) {
    const { data: pending } = await supabase
      .from('player_invites')
      .select('invited_email, origin')
      .eq('player_id', playerId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .not('invited_email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending?.invited_email) {
      return NextResponse.json({ error: 'No pending invite with an email to resend' }, { status: 400 });
    }
    emailToUse = pending.invited_email;
    originToUse = (pending.origin as InviteOrigin | null) ?? originToUse;
  }

  const result = await createGuardianInvite(supabase, playerId, user.id, emailToUse, originToUse);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, code: result.code });
}
