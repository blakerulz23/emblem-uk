import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Approve or reject a parent-submitted moment. Only coaches assigned to
 * the player's team can call this — the "moments: coaches can verify/update
 * for their team" RLS policy from 0001_init.sql enforces that at the DB
 * layer, so the endpoint doesn't need to re-check it here. If the caller
 * isn't authorised, Supabase returns zero rows updated and we return 404.
 *
 * On approve: sets status='approved', records verified_by/verified_at so
 * the audit trail is intact.
 * On reject: sets status='rejected' (soft-reject — kept in the DB so a
 * later dispute can be resolved). The moment is hidden from the guardian's
 * Journey view via the app's read layer, not RLS.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { action } = (await request.json()) as { action?: 'approve' | 'reject' };
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  const update =
    action === 'approve'
      ? {
          status: 'approved' as const,
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        }
      : { status: 'rejected' as const };

  const { data, error } = await supabase
    .from('moments')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error || !data) {
    // Row-not-found here means either the moment doesn't exist OR the caller
    // isn't a coach on the player's team (RLS makes the row invisible).
    // We don't tell them which — that's a small anti-enumeration measure.
    return NextResponse.json(
      { error: error?.message ?? 'Moment not found or not permitted' },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, momentId: data.id, status: data.status });
}
