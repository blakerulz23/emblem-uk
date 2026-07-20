import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';

export const runtime = 'nodejs';

/**
 * Guardian data export — closes the ICO right-of-access requirement.
 * Returns every row we hold about a player the caller is a guardian of,
 * plus 1-hour signed download URLs for every attached media file.
 *
 * RLS is the actual permission boundary: a guardian only sees their linked
 * player's rows, and a non-guardian gets zero rows back.
 *
 * The response is a plain JSON object so a parent (or a lawyer acting for
 * them) can save it, diff it against a later export, or hand it to
 * another controller during a data-portability request.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { playerId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  // Verify this caller actually is a guardian of playerId. RLS would already
  // hide the rows below if they aren't, but returning 403 with a clear
  // reason is friendlier than an empty payload.
  const { data: guardianLink } = await supabase
    .from('guardians')
    .select('player_id')
    .eq('player_id', params.playerId)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!guardianLink) {
    return NextResponse.json(
      { error: 'You are not listed as a guardian of that player.' },
      { status: 403 },
    );
  }

  const [{ data: player }, { data: moments }, { data: media }, { data: snapshots }] =
    await Promise.all([
      supabase.from('players').select('*').eq('id', params.playerId).single(),
      supabase
        .from('moments')
        .select('*')
        .eq('player_id', params.playerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('moment_media')
        .select('id, moment_id, s3_key, kind, created_at')
        .in(
          'moment_id',
          (
            await supabase
              .from('moments')
              .select('id')
              .eq('player_id', params.playerId)
          ).data?.map((m) => m.id) ?? [],
        ),
      supabase
        .from('player_skill_snapshots')
        .select('*')
        .eq('player_id', params.playerId)
        .order('season', { ascending: false }),
    ]);

  // Sign each media URL for 1 hour so the caller can actually download the
  // files this export refers to. The signed URL includes AWS SigV4 params
  // and expires — it's not a permanent link.
  const mediaWithUrls = await Promise.all(
    (media ?? []).map(async (m) => ({
      ...m,
      downloadUrl: await getSignedDownloadUrl(m.s3_key, 3600),
    })),
  );

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    exportedBy: user.id,
    player,
    moments,
    media: mediaWithUrls,
    skillSnapshots: snapshots,
    notice: 'Signed media URLs above expire in 1 hour. Re-request this export to get fresh links.',
  });
}
