import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

/**
 * Marks a Season Focus entry completed/archived — creator-only, enforced
 * by the "player_season_focus: creator can update their own entry" RLS
 * policy (0023_player_season_focus.sql), not just this route. A
 * non-creator's request matches zero rows (RLS filters it out before the
 * update ever applies) — checked explicitly so that's a real 403, not a
 * silent no-op "success", same convention as /api/os/goals/[id].
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { status } = body as { status?: 'completed' | 'archived' };
  if (!status || !['completed', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'status must be completed or archived' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('player_season_focus')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, player_id, label, author_role')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'You can only update entries you created' }, { status: 403 });
  }

  // Notify the *other* party that this focus's status changed — reusing
  // season_focus_added's event_type/schema (no separate "status changed"
  // event exists), with body text that reflects what actually happened
  // rather than reusing the creation copy verbatim.
  const [{ data: player }, { data: actor }] = await Promise.all([
    supabase.from('players').select('name, team_id').eq('id', data.player_id).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const statusWord = status === 'completed' ? 'completed' : 'archived';
  if (data.author_role === 'coach') {
    const { data: guardianRows } = await supabase.from('guardians').select('profile_id').eq('player_id', data.player_id);
    await generateStoryUpdate({
      eventType: 'season_focus_added',
      playerId: data.player_id,
      actorProfileId: user.id,
      recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `about:${data.player_id}` })),
      title: 'Season Focus',
      body: `${actor?.display_name ?? 'Their coach'} marked "${data.label}" as ${statusWord}`,
    });
  } else if (player?.team_id) {
    const { data: coachRows } = await supabase.from('coach_team').select('profile_id').eq('team_id', player.team_id);
    await generateStoryUpdate({
      eventType: 'season_focus_added',
      playerId: data.player_id,
      actorProfileId: user.id,
      recipients: (coachRows ?? []).map((c) => ({ profileId: c.profile_id, presenceScope: `coach-player:${data.player_id}` })),
      title: 'Season Focus',
      body: `${actor?.display_name ?? 'A guardian'} marked "${data.label}" as ${statusWord} for ${player?.name ?? 'their player'}`,
    });
  }

  return NextResponse.json({ ok: true });
}
