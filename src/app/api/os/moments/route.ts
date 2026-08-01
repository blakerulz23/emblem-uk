import { NextRequest, NextResponse } from 'next/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import { createClient } from '@/lib/supabase/server';
import { generateStoryUpdate } from '@/lib/story-updates';
import { getEligibleCoachProfileIds } from '@/lib/player-capabilities';

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
    .select('name, team_id')
    .eq('id', playerId)
    .maybeSingle();

  // eligible coach = team coach OR direct coach — centralised in
  // getEligibleCoachProfileIds (src/lib/player-capabilities.ts) rather
  // than re-derived here, so this route and the recipient computation
  // below always agree on the same set.
  const eligibleCoachIds = await getEligibleCoachProfileIds(supabase, playerId);
  const hasEligibleCoach = eligibleCoachIds.length > 0;
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

  // moment_uploaded / verification_required are mutually exclusive — this
  // upload produces exactly one, branching on the same hasEligibleCoach
  // check that decided verificationStatus above. No eligible coach means no
  // recipients, so nothing is generated (never both, never neither when a
  // coach does exist).
  if (eligibleCoachIds.length) {
    const { data: actor } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    const actorName = actor?.display_name ?? 'A guardian';
    const recipients = eligibleCoachIds.map((profileId) => ({
      profileId,
      presenceScope: verificationStatus === 'pending_verification' ? 'verify' : `coach-player:${playerId}`,
    }));
    await generateStoryUpdate({
      eventType: verificationStatus === 'pending_verification' ? 'verification_required' : 'moment_uploaded',
      playerId,
      actorProfileId: user.id,
      recipients,
      title: verificationStatus === 'pending_verification' ? 'Verification Needed' : 'Guardian Upload',
      body:
        verificationStatus === 'pending_verification'
          ? `${actorName} submitted a moment for ${player?.name ?? 'their player'} — waiting for your verification.`
          : `${actorName} uploaded a new moment for ${player?.name ?? 'their player'}.`,
      relatedMomentId: moment.id,
    });
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
