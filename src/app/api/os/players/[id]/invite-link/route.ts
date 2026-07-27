import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * The invite code is deliberately kept out of the bulk Team-screen
 * payload (getCoachOsData) — it's only ever fetched here, on demand,
 * when a coach actually opens Manage Invite or taps Copy Link.
 *
 * Re-checks team membership explicitly (coach_team -> teamIds -> this
 * player's team_id) rather than relying only on player_invites' own
 * "coaches can view for their team" RLS policy — belt-and-braces so the
 * authorization is visible in this route's own code, not just implicit
 * in a policy defined elsewhere. Both the session client and this
 * explicit check mean no service-role client is needed here at all.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data: teamLinks } = await supabase.from('coach_team').select('team_id').eq('profile_id', user.id);
  const teamIds = (teamLinks ?? []).map((t) => t.team_id as string);
  if (!teamIds.length) {
    return NextResponse.json({ error: 'Not authorized for this player' }, { status: 403 });
  }

  const { data: player } = await supabase.from('players').select('id, team_id').eq('id', params.id).maybeSingle();
  if (!player || !player.team_id || !teamIds.includes(player.team_id)) {
    return NextResponse.json({ error: 'Not authorized for this player' }, { status: 403 });
  }

  const { data: invite } = await supabase
    .from('player_invites')
    .select('code')
    .eq('player_id', params.id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite?.code) {
    return NextResponse.json({ error: 'No live invite for this player' }, { status: 404 });
  }

  return NextResponse.json({ code: invite.code });
}
