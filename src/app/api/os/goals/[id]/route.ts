import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Updates a goal's progress — creator-only, enforced by the
 * "player_goals: creator can update their own goal" RLS policy, not just
 * this route. A non-creator's request matches zero rows (RLS filters it
 * out before the update ever applies), which Supabase reports as an empty
 * `data` array rather than an error — checked explicitly below so that
 * case is reported as a real 403, not a silent no-op "success".
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
  const { current, status } = body as { current?: number; status?: 'in-progress' | 'completed' };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (current !== undefined) update.current = current;
  if (status !== undefined) update.status = status;

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('player_goals')
    .update(update)
    .eq('id', params.id)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'You can only update goals you created' }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
