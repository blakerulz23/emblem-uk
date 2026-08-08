import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A guardian edits their player's primary position. The existing
 * "players: guardians can update their player" RLS policy (0001_init.sql)
 * is the authorization, no service-role bypass needed. Whitelists only
 * `position` — never the guardian's route to touch secondary_position
 * (coach-only, see players/[id]/secondary-position).
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

  // Explicit column, not a bare .select() (which defaults to `*`) —
  // compatibility groundwork for the upcoming Coach Player Details
  // schema change, which will revoke broad table-level SELECT; `*` would
  // error outright the moment that lands if this route still asked for
  // it. Only existence/length of `data` is checked below, not any field.
  const { data, error } = await supabase
    .from('players')
    .update({ position: trimmed })
    .eq('id', params.id)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Not authorized to update this player' }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
