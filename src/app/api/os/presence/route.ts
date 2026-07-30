import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A heartbeat, not an event log — see src/app/os/usePresenceHeartbeat.ts.
 * Upserted every ~10s while a relevant screen is mounted and the tab is
 * visible; src/lib/story-updates.ts treats a row as "present" only while
 * last_seen_at is recent (~25s), so a missed "leave" signal (tab closed,
 * app backgrounded) just lets the row go stale rather than needing an
 * explicit delete to be correct.
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
  const { scope } = body as { scope?: string };
  if (!scope) {
    return NextResponse.json({ error: 'scope is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('active_viewers')
    .upsert({ profile_id: user.id, scope, last_seen_at: new Date().toISOString() }, { onConflict: 'profile_id,scope' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
