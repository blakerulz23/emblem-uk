import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl, AUTHENTICATED_OS_MEDIA_EXPIRY_SEC } from '@/lib/s3-client';

export const runtime = 'nodejs';

/**
 * Coach-only. GET returns { photoUrl } — Emblem does not collect, store or
 * derive a child's exact date of birth anywhere (Gate 2 privacy decision,
 * migration 0073_remove_exact_dob_stage_a.sql). This route used to also
 * call get_player_age/get_player_date_of_birth here; both were removed —
 * neither is called anywhere in the app any more, and the migration
 * revokes application-role execute privileges on both regardless.
 *
 * photoUrl is fetched differently: photo_key was never column-revoked (it
 * isn't privacy-sensitive — Profile.tsx already shows it to any guardian),
 * so a plain SELECT under the ordinary session-scoped client is enough,
 * authorized by the existing "players: visible to assigned coaches" RLS
 * policy — same signed-URL pattern getParentOsData already uses,
 * deliberately fetched here (this one player, on demand) rather than
 * bulk-signing a URL for every player in the squad list, which doesn't
 * need one.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data: photoRow } = await supabase.from('players').select('photo_key').eq('id', params.id).maybeSingle();
  const photoUrl = photoRow?.photo_key ? await getSignedDownloadUrl(photoRow.photo_key, AUTHENTICATED_OS_MEDIA_EXPIRY_SEC) : null;

  return NextResponse.json({ photoUrl });
}

type CoachFieldsBody = {
  footballAgeGroup?: string | null;
  heightCm?: number | null;
  preferredFoot?: 'Left' | 'Right' | 'Both' | null;
  secondaryPosition?: string | null;
};

// Emblem no longer accepts exact date of birth through any input, under any
// key — Gate 2 requires legacy aliases to be actively rejected, not
// silently ignored, so a stale client (or anyone probing the API directly)
// gets an explicit 400 rather than the field quietly being dropped.
const REJECTED_DOB_ALIASES = ['dateOfBirth', 'date_of_birth', 'date-of-birth', 'dob', 'birthDate', 'birth_date'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = (await request.json()) as CoachFieldsBody & Record<string, unknown>;

  const rejectedKey = REJECTED_DOB_ALIASES.find((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (rejectedKey) {
    return NextResponse.json(
      { error: 'Exact date of birth is no longer accepted. Emblem uses football age group only.' },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc('update_player_coach_fields', {
    p_player_id: params.id,
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
    // validation failure (out-of-range height, unsupported option,
    // secondary matching primary) — 400, not 500, same convention
    // secondary-position/route.ts already uses for its own validation
    // errors.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
