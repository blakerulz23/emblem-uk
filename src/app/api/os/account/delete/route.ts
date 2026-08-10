import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// This app has no password — guardians sign in by email OTP
// (src/app/os/overlays/SignIn.tsx), so "re-authentication" here can't mean
// "re-enter your password." The client re-runs the exact same
// signInWithOtp/verifyOtp flow immediately before calling this route,
// which genuinely re-establishes the session (a fresh sign-in, not a
// token refresh). This route independently verifies that happened by
// checking last_sign_in_at itself — a server-side fact the client cannot
// forge — rather than trusting that the client only called this route
// after showing a re-auth screen. Client-side button visibility is not
// authorization.
const RECENT_REAUTH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Permanently deletes the signed-in guardian's own account — never
 * another user's (there is no id in this route's own path; it always
 * acts on the caller's own auth.uid(), both in the RPC and here).
 *
 * Order: the SQL side first (delete_own_guardian_account, 0042 — unlinks
 * shared players, files player_deletion_requests for any player this
 * guardian was the sole guardian of, cleans up this guardian's own
 * residual references, deletes their `profiles` row), only then the
 * Supabase Auth user itself via the service-role admin API — never from
 * the browser, never with the service-role key anywhere near the client.
 *
 * Partial-failure handling (audited case: DB cleanup succeeds, the Auth
 * admin delete then fails — e.g. a transient Supabase Auth API issue).
 * The dangerous outcome to avoid is a still-valid login pointing at a
 * profile that no longer exists, so the session is signed out
 * unconditionally in that branch, even though the Auth *identity* row
 * (auth.users) hasn't been deleted yet — signOut() revokes the refresh
 * token server-side, not just local cookies, so that specific session
 * can never be used again regardless of what happens to the identity
 * row afterward. This does mean the client can no longer retry this
 * route itself once that happens (its session is deliberately dead) —
 * by design: closing "logged in with no profile" outweighs preserving a
 * client-side retry path. Recovery instead goes through
 * pending_auth_deletions (0043): a durable record for staff to finish
 * the one remaining step via direct Auth admin access — not a broader
 * job/outbox system, just a "this still needs doing" record, per the
 * explicit instruction not to build one without asking first.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const lastSignInMs = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
  if (Date.now() - lastSignInMs > RECENT_REAUTH_WINDOW_MS) {
    return NextResponse.json(
      { error: 'For your security, please verify your email code again before deleting your account.', code: 'REAUTH_REQUIRED' },
      { status: 401 }
    );
  }

  // Case B (DB cleanup fails before Auth deletion): nothing below this
  // point ever runs — the session stays fully valid, nothing was
  // touched, and delete_own_guardian_account is itself idempotent, so a
  // plain client retry is always safe here.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('delete_own_guardian_account');
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  // Case A (both succeed) vs Case C (DB succeeded, Auth delete fails).
  const serviceRole = createServiceRoleClient();
  const { error: authDeleteError } = await serviceRole.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    const nowIso = new Date().toISOString();
    const { data: existing } = await serviceRole
      .from('pending_auth_deletions')
      .select('id, attempts')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (existing) {
      await serviceRole
        .from('pending_auth_deletions')
        .update({ last_attempted_at: nowIso, attempts: existing.attempts + 1, last_error: authDeleteError.message })
        .eq('id', existing.id);
    } else {
      await serviceRole
        .from('pending_auth_deletions')
        .insert({ auth_user_id: user.id, email: user.email ?? null, first_attempted_at: nowIso, last_attempted_at: nowIso, last_error: authDeleteError.message });
    }

    // Revoke this session regardless of the Auth identity row's fate —
    // see the function doc comment for why this is unconditional.
    await supabase.auth.signOut();

    return NextResponse.json({
      ok: true,
      partial: true,
      message: "Your account data has been removed. We're still finishing the revocation of your sign-in — this is handled automatically, no action needed from you.",
      ...(typeof rpcResult === 'object' ? rpcResult : {}),
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true, partial: false, ...(typeof rpcResult === 'object' ? rpcResult : {}) });
}
