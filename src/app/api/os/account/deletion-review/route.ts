import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logRouteFailure } from '@/lib/route-failure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in account's own deletion review status, for Account Settings
 * (migration 0098, my_account_deletion_review: reads only auth.uid()'s own
 * request). If the function is unavailable the answer is "not under
 * review" — the settings page then shows the normal deletion option, which
 * is safe (a new request is idempotent).
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const { data, error } = await supabase.rpc('my_account_deletion_review');
  if (error) {
    logRouteFailure('account deletion review status', error);
    return NextResponse.json({ underReview: false, coachAccessPaused: false });
  }
  const r = (data ?? {}) as { underReview?: unknown; coachAccessPaused?: unknown };
  return NextResponse.json({ underReview: r.underReview === true, coachAccessPaused: r.coachAccessPaused === true });
}
