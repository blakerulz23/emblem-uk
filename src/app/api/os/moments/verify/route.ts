import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * A coach approves or rejects a pending (unverified) moment. Relies on the
 * existing "moments: coaches can verify/update for their team" RLS policy
 * for approve — no migration change needed there. Reject deletes the row
 * (cascades to moment_media) — the schema has no "rejected" state, and
 * removing an unverified, never-shown-to-anyone submission is the more
 * compliant reading of docs/compliance/children-data-checklist.md's
 * retention concerns, not less.
 */
export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { momentId, decision } = body as { momentId?: string; decision?: 'approve' | 'reject' };

  if (!momentId || (decision !== 'approve' && decision !== 'reject')) {
    return NextResponse.json({ error: 'momentId and a valid decision are required' }, { status: 400 });
  }

  if (decision === 'approve') {
    const { error } = await supabase
      .from('moments')
      .update({ verified_by: user.id, verified_at: new Date().toISOString() })
      .eq('id', momentId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from('moments').delete().eq('id', momentId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
