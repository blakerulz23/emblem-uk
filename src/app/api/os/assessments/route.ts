import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A coach shares a new assessment — append-only history, never an edit to
 * a prior one (0022_player_assessments.sql grants only select/insert, no
 * update/delete policy exists at all). Relies on player_assessments'
 * "coaches can add for their team" insert RLS policy for authorization.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const requestBody = await request.json();
  const { playerId, body } = requestBody as { playerId?: string; body?: string };
  const trimmed = body?.trim();
  if (!playerId || !trimmed) {
    return NextResponse.json({ error: 'playerId and body are required' }, { status: 400 });
  }

  const { data: assessment, error } = await supabase
    .from('player_assessments')
    .insert({ player_id: playerId, created_by: user.id, body: trimmed })
    .select()
    .single();

  if (error) {
    const status = error.message.includes('row-level security') ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (!assessment) {
    return NextResponse.json({ error: 'Could not save assessment' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assessmentId: assessment.id });
}
