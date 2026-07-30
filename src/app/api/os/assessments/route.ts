import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

/**
 * A coach shares a new assessment — append-only history, never an edit to
 * a prior one (0022_player_assessments.sql grants only select/insert, no
 * update/delete policy exists at all). Relies on player_assessments'
 * "coaches can add for their team" insert RLS policy for authorization.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const requestBody = await request.json();
  const { playerId, body } = requestBody as { playerId?: string; body?: string };
  const trimmed = body?.trim();
  if (!playerId || !trimmed) {
    return NextResponse.json({ error: 'playerId and body are required' }, { status: 400 });
  }

  const { data: assessment, error } = await supabase
    .from('player_assessments')
    .insert({ player_id: playerId, created_by: user.id, body: trimmed })
    .select()
    .single();

  if (error) {
    const status = error.message.includes('row-level security') ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!assessment) {
    return NextResponse.json({ error: 'Could not save assessment' }, { status: 500 });
  }

  const [{ data: guardianRows }, { data: player }, { data: actor }] = await Promise.all([
    supabase.from('guardians').select('profile_id').eq('player_id', playerId),
    supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const actorName = actor?.display_name ?? 'Your coach';
  const excerpt = trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed;
  await generateStoryUpdate({
    eventType: 'assessment_shared',
    playerId,
    actorProfileId: user.id,
    recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `about:${playerId}` })),
    title: 'Coach Assessment',
    body: `${actorName} shared new feedback on ${player?.name ?? 'your player'}: "${excerpt}"`,
  });

  return NextResponse.json({ ok: true, assessmentId: assessment.id });
}
