import { NextRequest, NextResponse } from 'next/server';
import { deleteObject } from '@/lib/s3-client';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/**
 * Permanently deletes a moment and its media — guardian-only, from
 * Account Settings / the shared media viewer's own "Delete moment"
 * action, never Coach Verify (rejecting a pending moment there is a
 * separate, unchanged path — src/app/api/os/moments/verify/route.ts).
 *
 * Deliberately no service-role existence check. An earlier version used
 * one to distinguish "doesn't exist" (idempotent 200) from "exists but
 * isn't yours" (403) — but that distinction is itself an oracle: it lets
 * anyone learn whether an arbitrary UUID is a real moment just by reading
 * the status code, with no ownership required. The fix here is a single
 * neutral response for every case that isn't "you are a guardian of this
 * moment's player": genuinely nonexistent, someone else's moment, and
 * (deliberately) a coach who can legitimately *read* it via RLS but isn't
 * the guardian all return the exact same 404. A coach's own read access
 * elsewhere in the app (Coach Verify, etc.) is real and unaffected — this
 * route just never uses that access as a signal.
 *
 * The lookup below runs on the session client, not service role — RLS
 * already scopes it to (guardian OR assigned coach), so a truly unrelated
 * caller's query returns null for exactly the same reason a nonexistent
 * moment would: indistinguishable by construction, not by convention.
 * This does mean a caller who successfully deleted their own moment gets
 * the same 404 on a later retry (the row is genuinely gone, so the lookup
 * can no longer tell "you deleted this" from "this was never yours" —
 * there's nothing left to check that distinction against). That's an
 * accepted, deliberate tradeoff: neutrality against a real oracle wins
 * over a friendlier retry response. The client treats 404 on this
 * endpoint as "already gone" and closes/refreshes quietly rather than
 * showing an error, so the guardian who actually did the deleting still
 * gets a clean result.
 *
 * delete_own_moment (0040) remains the authoritative mutation boundary —
 * it independently re-checks auth.uid() ownership itself and would raise
 * even if this route's own check were ever bypassed or raced.
 *
 * S3-first, then the DB commit — the DB should only ever say "gone" once
 * the media genuinely is. Every step here is idempotent (S3 DeleteObject
 * on an already-gone key succeeds; the RPC returns true for an
 * already-deleted moment), so a retry is always safe to re-send in full.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data: moment, error: momentError } = await supabase
    .from('moments')
    .select('id, player_id')
    .eq('id', params.id)
    .maybeSingle();
  if (momentError) {
    return NextResponse.json({ error: momentError.message }, { status: 500 });
  }
  if (!moment) {
    return NOT_FOUND();
  }

  const { data: guardianRow } = await supabase
    .from('guardians')
    .select('player_id')
    .eq('player_id', moment.player_id)
    .eq('profile_id', user.id)
    .maybeSingle();
  if (!guardianRow) {
    return NOT_FOUND();
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .from('moment_media')
    .select('s3_key')
    .eq('moment_id', params.id);
  if (mediaError) {
    return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  for (const media of mediaRows ?? []) {
    try {
      await deleteObject(media.s3_key);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete this moment’s media — try again.';
      return NextResponse.json(
        { error: message.includes('AWS_S3_BUCKET') ? 'Media storage is not configured' : message },
        { status: 500 }
      );
    }
  }

  const { error: rpcError } = await supabase.rpc('delete_own_moment', { p_moment_id: params.id });
  if (rpcError) {
    if (rpcError.message.includes('Not authorized')) {
      // Only reachable via a genuine race (authorization revoked between
      // the check above and this call) — same neutral response, for the
      // same reason: no distinguishable signal for this route, ever.
      return NOT_FOUND();
    }
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
