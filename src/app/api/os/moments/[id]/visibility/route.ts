import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logVisibilityChange } from '@/lib/visibility-audit';

export const runtime = 'nodejs';

const SELECTABLE_VISIBILITY = ['private', 'public'] as const;

/**
 * The only route that ever changes moments.visibility. Guardian-only —
 * coaches verify (verification_status), they never publish. "family" and
 * "club" are real schema values but not yet selectable here (no genuine
 * family-member/extended-club-roster viewer relationship exists to enforce
 * them against yet) — rejected server-side, not just hidden in a picker.
 *
 * Writes via the session client, not service role, so the real
 * "moments: guardians can set visibility" RLS policy is what's actually
 * enforcing this — the explicit guardian check below is belt-and-braces,
 * matching this codebase's established "route re-verifies, RLS backstops"
 * shape, not a replacement for RLS.
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
  const { visibility } = body as { visibility?: string };
  if (!visibility || !SELECTABLE_VISIBILITY.includes(visibility as (typeof SELECTABLE_VISIBILITY)[number])) {
    return NextResponse.json(
      { error: "visibility must be 'private' or 'public' — family/club are reserved, not selectable yet" },
      { status: 400 }
    );
  }

  const serviceRole = createServiceRoleClient();
  const { data: moment } = await serviceRole.from('moments').select('id, player_id, visibility').eq('id', params.id).maybeSingle();
  if (!moment) {
    return NextResponse.json({ error: 'Moment not found' }, { status: 404 });
  }

  const { data: guardianRow } = await serviceRole
    .from('guardians')
    .select('player_id')
    .eq('player_id', moment.player_id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!guardianRow) {
    return NextResponse.json({ error: 'Only a guardian can change this' }, { status: 403 });
  }

  if (moment.visibility === visibility) {
    return NextResponse.json({ ok: true, visibility });
  }

  const { error: updateError } = await supabase.from('moments').update({ visibility }).eq('id', params.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logVisibilityChange(serviceRole, {
    momentId: moment.id,
    playerId: moment.player_id,
    changedBy: user.id,
    previousVisibility: moment.visibility,
    newVisibility: visibility,
  });

  return NextResponse.json({ ok: true, visibility });
}
