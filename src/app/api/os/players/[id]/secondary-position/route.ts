import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Coach-only. The real authorization + column-scoping boundary is the
 * update_secondary_position SECURITY DEFINER function
 * (0021_players_coach_fields.sql) — it explicitly checks the caller is a
 * coach of this player's team and can only ever write secondary_position,
 * regardless of what this route does. This route just validates input,
 * calls the RPC, and maps its raised exception to the right HTTP status.
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
  const { secondaryPosition } = body as { secondaryPosition?: string | null };

  const { error } = await supabase.rpc('update_secondary_position', {
    p_player_id: params.id,
    p_secondary_position: secondaryPosition ?? null,
  });

  if (error) {
    if (error.message.includes('Not authorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error.message.includes('60 characters')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
