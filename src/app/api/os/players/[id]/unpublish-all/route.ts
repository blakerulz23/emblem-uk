import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logVisibilityChange } from '@/lib/visibility-audit';

export const runtime = 'nodejs';

/**
 * The guardian "panic button" — immediately reverts every one of this
 * player's public moments back to private, in one action. Guardian-only,
 * same relationship check and same session-client-does-the-write pattern
 * as the single-item visibility route (src/app/api/os/moments/[id]/
 * visibility/route.ts), sharing its audit-log helper so a bulk unpublish
 * shows up in the trail as clearly as an individual one did.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const serviceRole = createServiceRoleClient();
  const { data: guardianRow } = await serviceRole
    .from('guardians')
    .select('player_id')
    .eq('player_id', params.id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!guardianRow) {
    return NextResponse.json({ error: 'Only a guardian can do this' }, { status: 403 });
  }

  const { data: publicMoments } = await serviceRole.from('moments').select('id').eq('player_id', params.id).eq('visibility', 'public');
  if (!publicMoments || publicMoments.length === 0) {
    return NextResponse.json({ ok: true, unpublished: 0 });
  }

  const { error: updateError } = await supabase
    .from('moments')
    .update({ visibility: 'private' })
    .eq('player_id', params.id)
    .eq('visibility', 'public');
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await Promise.all(
    publicMoments.map((m) =>
      logVisibilityChange(serviceRole, {
        momentId: m.id,
        playerId: params.id,
        changedBy: user.id,
        previousVisibility: 'public',
        newVisibility: 'private',
      })
    )
  );

  return NextResponse.json({ ok: true, unpublished: publicMoments.length });
}
