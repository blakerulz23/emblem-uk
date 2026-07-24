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
 *
 * Reject turns RLS's silent zero-row filter into a real error rather than
 * reporting success — same pattern as src/app/api/os/goals/[id]/route.ts.
 * Until migration 0010, `moments` had no DELETE policy at all, so this
 * branch always matched zero rows and still returned { ok: true } with
 * nothing actually deleted — that's the bug this fixes. Approve has the
 * same class of latent gap (an unauthorized coach's update also silently
 * matches zero rows and still returns { ok: true }) but is intentionally
 * left unchanged here — out of this fix's scope, not overlooked.
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

  // .is('verified_at', null) mirrors the new RLS policy's own restriction —
  // belt and suspenders, not redundant: it means this route can never
  // delete an already-verified moment even if the policy were ever loosened
  // or misapplied. .select('id') is what lets the zero-rows check below
  // actually see whether anything was deleted, rather than trusting a
  // no-error response that RLS could have silently filtered to nothing.
  const { data, error } = await supabase
    .from('moments')
    .delete()
    .eq('id', momentId)
    .is('verified_at', null)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "This moment can't be rejected — it may not exist, may already be verified, or you may not have permission" },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
