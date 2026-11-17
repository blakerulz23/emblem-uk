import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How long an identical recognition (same coach, player, award and
 * message) is treated as a retry of the first rather than a new one. A
 * coach retrying after a network failure whose insert actually committed
 * gets the original back instead of a duplicate in the family's
 * Collection. Content-based because moments has no request-id column yet;
 * the client also blocks a second send while one is in flight.
 */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

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

  const body = (await request.json().catch(() => null)) as { playerId?: unknown; award?: unknown; message?: unknown } | null;
  const playerId = typeof body?.playerId === 'string' ? body.playerId : '';
  const award = typeof body?.award === 'string' ? body.award.trim() : '';
  const note = typeof body?.message === 'string' && body.message.trim() ? body.message.trim() : null;

  if (!UUID_PATTERN.test(playerId) || !award) {
    return NextResponse.json({ error: 'playerId and award are required' }, { status: 400 });
  }

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const duplicateQuery = supabase
    .from('moments')
    .select('id')
    .eq('player_id', playerId)
    .eq('uploaded_by', user.id)
    .eq('trust', 'coach')
    .eq('title', award)
    .gte('created_at', since);
  const { data: existing } = await (note === null ? duplicateQuery.is('note', null) : duplicateQuery.eq('note', note))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing) {
    return NextResponse.json({ ok: true, momentId: existing.id, duplicate: true });
  }

  const { data: moment, error } = await supabase
    .from('moments')
    .insert({
      player_id: playerId,
      title: award,
      trust: 'coach',
      note,
      uploaded_by: user.id,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      verification_status: 'coach_verified',
    })
    .select()
    .single();

  if (error || !moment) {
    // The database message can name policies and columns — log it, don't return it.
    if (error) console.error('celebrate insert failed', error.message);
    return NextResponse.json({ error: 'Could not send recognition' }, { status: 500 });
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
