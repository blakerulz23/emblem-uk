import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A guardian turns their player's public profile (/player/[publicPlayerId])
 * on or off — the Share Profile action, and its "turn off" counterpart.
 * Calls update_player_public_visibility (0039_guardian_public_profile_
 * control.sql), a SECURITY DEFINER function, not a raw `.update()` — same
 * pattern as position/route.ts's update_primary_position, since
 * `authenticated` has no UPDATE grant on public_id_enabled (only SELECT).
 * Distinct from the staff-only kill switch at
 * /api/staff/players/[id]/public-profile/route.ts (requireStaff, supports
 * rotate too) — this route is guardian-authorized only and only ever
 * flips the same boolean staff can also administratively override.
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
  const { enabled } = body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
  }

  const { data: result, error } = await supabase.rpc('update_player_public_visibility', {
    p_player_id: params.id,
    p_enabled: enabled,
  });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Not authorized to change this player’s public profile visibility' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, publicIdEnabled: Boolean(result) });
}
