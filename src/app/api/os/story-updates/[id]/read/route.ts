import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Marks one Story Update as read. RLS ("recipient can mark their own
 * read") scopes this to the caller's own row, and the column-scoped grant
 * (0025_story_updates.sql — update on read_at only) means this route
 * structurally can't touch title/body/event_type even if it tried.
 * Zero rows affected (not the caller's row, or already read) is a no-op,
 * not an error — "already read" is never a failure state.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { error } = await supabase
    .from('story_updates')
    .update({ read_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('read_at', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
