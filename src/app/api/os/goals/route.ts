import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Creates a season goal — either a guardian or a coach of the player can
 * do this. Relies on player_goals' two insert RLS policies ("guardians can
 * create for their player" / "coaches can create for their team") to
 * reject anyone with no real relationship to playerId, so there's no need
 * to re-check that relationship here.
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
  const { playerId, label, target, current, unit } = body as {
    playerId?: string;
    label?: string;
    target?: number;
    current?: number;
    unit?: string;
  };

  if (!playerId || !label?.trim() || !target || target <= 0) {
    return NextResponse.json({ error: 'playerId, label and a positive target are required' }, { status: 400 });
  }

  const { data: goal, error } = await supabase
    .from('player_goals')
    .insert({
      player_id: playerId,
      created_by: user.id,
      label: label.trim(),
      target,
      current: current ?? 0,
      unit: unit?.trim() || null,
    })
    .select()
    .single();

  if (error || !goal) {
    return NextResponse.json({ error: error?.message ?? 'Could not create goal' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, goalId: goal.id });
}

/**
 * Lists a player's season goals. RLS scopes this to guardians of the
 * player or coaches of their team, same as the insert above.
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

  const { data: goals, error } = await supabase
    .from('player_goals')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goals: goals ?? [] });
}
