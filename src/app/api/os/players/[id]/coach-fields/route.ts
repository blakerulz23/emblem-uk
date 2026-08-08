import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';

export const runtime = 'nodejs';

/**
 * Coach-only. GET returns { age, dateOfBirth, photoUrl } — the *only*
 * place in the app that ever asks for the raw date of birth, called
 * specifically when Coach Player Details opens for one player (never
 * bundled into the squad list — see get_player_date_of_birth's own
 * comment in 0036_player_coach_fields_secure_expand.sql for why). The real
 * authorization + column-scoping boundary for age/dateOfBirth is the two
 * SECURITY DEFINER functions this route calls, exactly like
 * secondary-position/route.ts already established for
 * update_secondary_position — this route just calls them and maps errors
 * to the right HTTP status, it does not itself decide who is allowed to
 * see or change anything.
 *
 * photoUrl is fetched differently: photo_key was never column-revoked (it
 * isn't privacy-sensitive the way date_of_birth is — Profile.tsx already
 * shows it to any guardian), so a plain SELECT under the ordinary
 * session-scoped client is enough, authorized by the existing "players:
 * visible to assigned coaches" RLS policy — same signed-URL pattern
 * getParentOsData already uses, deliberately fetched here (this one
 * player, on demand) rather than bulk-signing a URL for every player in
 * the squad list, which doesn't need one.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const [{ data: age, error: ageError }, { data: dateOfBirth, error: dobError }, { data: photoRow }] = await Promise.all([
    supabase.rpc('get_player_age', { p_player_id: params.id }),
    supabase.rpc('get_player_date_of_birth', { p_player_id: params.id }),
    supabase.from('players').select('photo_key').eq('id', params.id).maybeSingle(),
  ]);

  // get_player_age is intentionally broader than get_player_date_of_birth
  // (guardian OR coach vs. coach-only) — a dobError here specifically means
  // "not an authorized coach of this player", which is what this route
  // actually requires, so it's the one that determines the response status.
  if (dobError) {
    if (dobError.message.includes('Not authorized')) {
      return NextResponse.json({ error: dobError.message }, { status: 403 });
    }
    return NextResponse.json({ error: dobError.message }, { status: 500 });
  }
  if (ageError) {
    return NextResponse.json({ error: ageError.message }, { status: 500 });
  }

  const photoUrl = photoRow?.photo_key ? await getSignedDownloadUrl(photoRow.photo_key) : null;

  return NextResponse.json({ age: age ?? null, dateOfBirth: dateOfBirth ?? null, photoUrl });
}

type CoachFieldsBody = {
  dateOfBirth?: string | null;
  footballAgeGroup?: string | null;
  heightCm?: number | null;
  preferredFoot?: 'Left' | 'Right' | 'Both' | null;
  secondaryPosition?: string | null;
};

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json()) as CoachFieldsBody;

  const { error } = await supabase.rpc('update_player_coach_fields', {
    p_player_id: params.id,
    p_date_of_birth: body.dateOfBirth ?? null,
    p_football_age_group: body.footballAgeGroup ?? null,
    p_height_cm: body.heightCm ?? null,
    p_preferred_foot: body.preferredFoot ?? null,
    p_secondary_position: body.secondaryPosition ?? null,
  });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // Every other raised exception in update_player_coach_fields is a
    // validation failure (future date, implausible age, out-of-range
    // height, unsupported option, secondary matching primary) — 400, not
    // 500, same convention secondary-position/route.ts already uses for
    // its own validation errors.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
