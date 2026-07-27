import { NextRequest, NextResponse } from 'next/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type MediaInput = { key: string; kind: 'photo' | 'video' };

/**
 * Creates a moment + its media rows — the real Add-Moment submit. Relies on
 * the "moments: guardians can submit for their player" RLS policy to reject
 * anyone who isn't a guardian of playerId, so there's no need to re-check
 * that relationship here.
 *
 * verification_status is decided once, right here, at submission time — not
 * something read paths ever re-derive from the player's current team/coach
 * state (see migration 0011). "Family Memory" vs "Pending Verification"
 * depends on whether an eligible coach is assigned *right now*; if the
 * player later joins a team, this row's status never changes retroactively.
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
  const { playerId, title, occurredOn, note, media } = body as {
    playerId?: string;
    title?: string;
    occurredOn?: string;
    note?: string;
    media?: MediaInput[];
  };

  if (!playerId || !title) {
    return NextResponse.json({ error: 'playerId and title are required' }, { status: 400 });
  }

  const { data: player } = await supabase
    .from('players')
    .select('team_id')
    .eq('id', playerId)
    .maybeSingle();

  let hasEligibleCoach = false;
  if (player?.team_id) {
    const { count } = await supabase
      .from('coach_team')
      .select('profile_id', { count: 'exact', head: true })
      .eq('team_id', player.team_id);
    hasEligibleCoach = (count ?? 0) > 0;
  }
  const verificationStatus = hasEligibleCoach ? 'pending_verification' : 'family_memory';

  const { data: moment, error: momentError } = await supabase
    .from('moments')
    .insert({
      player_id: playerId,
      title,
      occurred_on: occurredOn ?? null,
      trust: 'parent',
      note: note ?? null,
      uploaded_by: user.id,
      verification_status: verificationStatus,
    })
    .select()
    .single();

  if (momentError || !moment) {
    return NextResponse.json({ error: momentError?.message ?? 'Could not create moment' }, { status: 500 });
  }

  if (media?.length) {
    const { error: mediaError } = await supabase.from('moment_media').insert(
      media.map((m) => ({ moment_id: moment.id, s3_key: m.key, kind: m.kind }))
    );
    if (mediaError) {
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, momentId: moment.id, status: verificationStatus });
}

/**
 * Lists a player's moments with signed (private, time-limited) download
 * URLs for each media item — matching the ActivationGate's "Private &
 * secure" promise. RLS scopes this to guardians of the player or coaches of
 * their team, same as the insert above.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const playerId = request.nextUrl.searchParams.get('playerId');
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }
  const status = request.nextUrl.searchParams.get('status') ?? 'all';

  let query = supabase
    .from('moments')
    .select('*, moment_media(*)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  // Filters on verification_status, not verified_at — both family_memory
  // and pending_verification have verified_at is null, so a verified_at
  // filter alone can't distinguish them (see migration 0011).
  if (status === 'pending') {
    query = query.eq('verification_status', 'pending_verification');
  } else if (status === 'verified') {
    query = query.eq('verification_status', 'coach_verified');
  } else if (status === 'family') {
    query = query.eq('verification_status', 'family_memory');
  }

  const { data: moments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withUrls = await Promise.all(
    (moments ?? []).map(async (moment) => ({
      ...moment,
      moment_media: await Promise.all(
        (moment.moment_media ?? []).map(async (m: { s3_key: string; kind: string }) => ({
          ...m,
          url: await getSignedDownloadUrl(m.s3_key),
        }))
      ),
    }))
  );

  return NextResponse.json({ moments: withUrls });
}
