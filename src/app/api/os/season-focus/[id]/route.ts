import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Marks a Season Focus entry completed/archived — creator-only, enforced
 * by the "player_season_focus: creator can update their own entry" RLS
 * policy (0023_player_season_focus.sql), not just this route. A
 * non-creator's request matches zero rows (RLS filters it out before the
 * update ever applies) — checked explicitly so that's a real 403, not a
 * silent no-op "success", same convention as /api/os/goals/[id].
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
  const { status } = body as { status?: 'completed' | 'archived' };
  if (!status || !['completed', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'status must be completed or archived' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('player_season_focus')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'You can only update entries you created' }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
