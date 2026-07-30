import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A coach adds a Recognised Strength — append-only, no update/delete path
 * exists at all (0024_player_strengths.sql grants only select/insert).
 * Relies on player_strengths' "coaches can add for their team" insert RLS
 * policy for authorization.
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
  const trimmed = label?.trim();
  if (!playerId || !trimmed) {
    return NextResponse.json({ error: 'playerId and label are required' }, { status: 400 });
  }

  const { data: strength, error } = await supabase
    .from('player_strengths')
    .insert({ player_id: playerId, created_by: user.id, label: trimmed })
    .select()
    .single();

  if (error) {
    const status = error.message.includes('row-level security') ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!strength) {
    return NextResponse.json({ error: 'Could not save strength' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, strengthId: strength.id });
}
