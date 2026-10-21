import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

/**
 * Removes exactly one direct coach_players connection — either a guardian
 * revoking a coach, or a coach leaving their own connection. The caller's
 * authority is checked here first, then the removal goes through the
 * service-role-only remove_direct_coach_link (migration 0088), which
 * re-checks that authority, deletes just this link and records the actor
 * and reason in the relationship audit trail. coach_players has no
 * insert/update/delete grant or policy for signed-in users at all.
 *
 * Nothing in player_assessments/player_strengths/moments/player_season_focus
 * references coach_players, so this can never cascade into historical
 * content — access ends, history remains, by construction.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; coachProfileId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { id: playerId, coachProfileId } = params;
  const serviceRole = createServiceRoleClient();

  const isSelf = user.id === coachProfileId;
  let isGuardian = false;
  if (!isSelf) {
    const { data: guardianRow } = await serviceRole
      .from('guardians')
      .select('player_id')
      .eq('player_id', playerId)
      .eq('profile_id', user.id)
      .maybeSingle();
    isGuardian = !!guardianRow;
  }

  if (!isSelf && !isGuardian) {
    return NextResponse.json({ error: 'Only a guardian of this player, or the connected coach themselves, can do this' }, { status: 403 });
  }

  const { data: result, error } = await serviceRole.rpc('remove_direct_coach_link', {
    p_player_id: playerId,
    p_coach_profile_id: coachProfileId,
    p_actor_profile_id: user.id,
    p_reason: isSelf ? 'The coach ended their own connection' : 'Removed by a guardian',
  });
  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Only a guardian of this player, or the connected coach themselves, can do this' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Could not remove this connection' }, { status: 500 });
  }
  if (result !== 'removed') {
    // Already removed (or never existed): nothing changed, nothing to report.
    return NextResponse.json({ error: 'No direct connection found for this player and coach' }, { status: 404 });
  }

  // Fired only now, after the removal is confirmed — a 403/404 never
  // reaches here. Distinguishes the two real actors this route already
  // knows about (isSelf, computed for authorization) in the copy itself,
  // without ever naming "coach_players"/"direct connection"/a profile id
  // to the reader.
  const [{ data: guardianRows }, { data: player }, { data: actor }] = await Promise.all([
    serviceRole.from('guardians').select('profile_id').eq('player_id', playerId),
    serviceRole.from('players').select('name').eq('id', playerId).maybeSingle(),
    isSelf ? serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [firstName] = (player?.name ?? 'your player').trim().split(/\s+/);
  const body = isSelf
    ? `${actor?.display_name ?? 'Their coach'} ended their coaching connection with ${firstName}.`
    : `Coach access was removed for ${firstName}.`;
  await generateStoryUpdate({
    eventType: 'coach_removed',
    playerId,
    actorProfileId: user.id,
    recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `coach-player:${playerId}` })),
    title: 'Coach Removed',
    body,
  });

  return NextResponse.json({ ok: true });
}
