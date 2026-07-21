import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A guardian edits their player's favourite-player/football-ambition
 * fields — deliberately scoped to just these two, not name/position/squad
 * number, which nothing has asked to make editable here. Uses the regular
 * session-scoped client; the existing "players: guardians can update their
 * player" RLS policy (0001_init.sql) is the authorization, no service-role
 * bypass needed.
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
  const { favouritePlayer, footballAmbition } = body as { favouritePlayer?: string; footballAmbition?: string };

  const update: Record<string, string | null> = {};
  if (favouritePlayer !== undefined) update.favourite_player = favouritePlayer.trim() || null;
  if (footballAmbition !== undefined) update.football_ambition = footballAmbition.trim() || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabase.from('players').update(update).eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
