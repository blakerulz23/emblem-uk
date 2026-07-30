import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

/**
 * A coach's "Send Recognition" — writes a moment with trust: 'coach'.
 * Relies on the "moments: coaches can create recognitions for their team"
 * RLS policy to reject anyone who isn't assigned to playerId's team.
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
  const { playerId, award, message } = body as { playerId?: string; award?: string; message?: string };

  if (!playerId || !award) {
    return NextResponse.json({ error: 'playerId and award are required' }, { status: 400 });
  }

  const { data: moment, error } = await supabase
    .from('moments')
    .insert({
      player_id: playerId,
      title: award,
      trust: 'coach',
      note: message ?? null,
      uploaded_by: user.id,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      verification_status: 'coach_verified',
    })
    .select()
    .single();

  if (error || !moment) {
    return NextResponse.json({ error: error?.message ?? 'Could not send recognition' }, { status: 500 });
  }

  const [{ data: guardianRows }, { data: player }, { data: actor }] = await Promise.all([
    supabase.from('guardians').select('profile_id').eq('player_id', playerId),
    supabase.from('players').select('name').eq('id', playerId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const actorName = actor?.display_name ?? 'Their coach';
  await generateStoryUpdate({
    eventType: 'recognition',
    playerId,
    actorProfileId: user.id,
    recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `collection:${playerId}` })),
    title: 'Coach Recognition',
    body: `${actorName} recognised ${player?.name ?? 'your player'} — ${award}`,
    relatedMomentId: moment.id,
  });

  return NextResponse.json({ ok: true, momentId: moment.id });
}
