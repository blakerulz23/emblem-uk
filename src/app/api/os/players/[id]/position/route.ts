import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A guardian edits their player's primary position. Calls
 * update_primary_position (0036_player_coach_fields_secure_expand.sql,
 * Part 5), a SECURITY DEFINER function, not a raw `.update()`. Deploying
 * this route (Stage 2) is itself a precondition for
 * 0038_player_position_permission_lock.sql (Stage 2.5), which is what
 * actually revokes `authenticated`'s raw table-level UPDATE grant on
 * `position` and makes this RPC the only *effective* write path — not
 * this file alone; see that migration's header for why it isn't folded in
 * here. The function re-derives the guardian authorization itself (the
 * same boundary the old "players: guardians can update their player" RLS
 * policy enforced) and, in the same atomic write, clears
 * secondary_position if the new primary position collides with a
 * coach-set one — see the function body for why. Never touches
 * secondary_position to anything other than null.
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
  const { position } = body as { position?: string };
  const trimmed = position?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'A position is required' }, { status: 400 });
  }

  const { data: secondaryPositionCleared, error } = await supabase.rpc('update_primary_position', {
    p_player_id: params.id,
    p_position: trimmed,
  });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: 'Not authorized to update this player' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, secondaryPositionCleared: Boolean(secondaryPositionCleared) });
}
