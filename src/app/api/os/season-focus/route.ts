import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Creates a Season Focus entry — either a guardian or a coach of the
 * player can do this. All of the real logic (author-role determination,
 * label validation, the row-locked 3-active cap, the insert itself) lives
 * in create_season_focus, a SECURITY DEFINER function
 * (0023_player_season_focus.sql). A direct INSERT + RLS count-check was
 * tried first and found to cause `42P17: infinite recursion detected in
 * policy` — a self-referencing subquery inside an INSERT policy's WITH
 * CHECK triggers this table's own RLS recursively. This route never
 * inserts into player_season_focus directly, only calls the RPC.
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
  const { playerId, label } = body as { playerId?: string; label?: string };
  if (!playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  }

  const { data: focusId, error } = await supabase.rpc('create_season_focus', {
    p_player_id: playerId,
    p_label: label ?? '',
  });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message.includes('label') || error.message.includes('3 active')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, focusId });
}

/**
 * Lists a player's Season Focus entries (active + completed/archived).
 * RLS scopes this to guardians of the player or coaches of their team.
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

  const { data: seasonFocus, error } = await supabase
    .from('player_season_focus')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ seasonFocus: seasonFocus ?? [] });
}
