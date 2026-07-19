import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A coach's "Send Recognition" — writes a moment with trust: 'coach'.
 * Relies on the "moments: coaches can create recognitions for their team"
 * RLS policy to reject anyone who isn't assigned to playerId's team.
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
  const { playerId, award, message } = body as { playerId?: string; award?: string; message?: string };

  if (!playerId || !award) {
    return NextResponse.json({ error: 'playerId and award are required' }, { status: 400 });
  }

  const { data: moment, error } = await supabase
    .from('moments')
    .insert({
      player_id: playerId,
      title: award,
      trust: 'coach',
      note: message ?? null,
      uploaded_by: user.id,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !moment) {
    return NextResponse.json({ error: error?.message ?? 'Could not send recognition' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, momentId: moment.id });
}
