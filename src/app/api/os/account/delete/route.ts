import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';
import { logRouteFailure, raised } from '@/lib/route-failure';
import { ACCOUNT_ERASED_CODE, ACCOUNT_ERASED_MESSAGE, STAFF_ACCOUNT_DELETE_REFUSED, deletionReviewResponse } from '@/lib/account-deletion-copy';
import { redactEmails } from '@/lib/redact-email';

export const runtime = 'nodejs';

const ACCOUNT_DELETE_FAILED_MESSAGE = 'Could not delete your account. Please try again.';
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
 * Order: the SQL side first (delete_own_guardian_account). When nothing
 * blocks the deletion it erases the account (0042/0076/0097 — unlinks
 * shared players, files player_deletion_requests for any player this
 * guardian was the sole guardian of, cleans up this guardian's own
 * residual references, deletes their `profiles` row); only then the
 * Supabase Auth user itself via the service-role admin API — never from
 * the browser, never with the service-role key anywhere near the client.
 * When something blocks it, the request goes to staff review instead and
 * nothing is erased (see below).
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
    // Database text never reaches the caller or the log. The function's one
    // expected refusal (no session) is a 401; anything else a generic 500.
    if (raised(rpcError, 'Not authenticated')) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    // Migration 0098: staff accounts are removed by a manual, two-person
    // procedure, never here. Nothing was changed.
    if (raised(rpcError, 'Staff accounts cannot be deleted from the app')) {
      return NextResponse.json({ error: STAFF_ACCOUNT_DELETE_REFUSED }, { status: 403 });
    }
    // Migration 0097: this account was already erased (a still-valid session
    // of a deleted account). Nothing was changed; the session is ended.
    if (raised(rpcError, 'account_erased')) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: ACCOUNT_ERASED_MESSAGE, code: ACCOUNT_ERASED_CODE }, { status: 401 });
    }
    logRouteFailure('account deletion: cleanup', rpcError);
    return NextResponse.json({ error: ACCOUNT_DELETE_FAILED_MESSAGE }, { status: 500 });
  }

  // canDeleteIdentity is false when a NOT-NULL profile-referencing row
  // still exists (Squad Invite organiser/audit history, coach-authored
  // player records). From migration 0097 the RPC then only records the
  // request in pending_profile_deletions for staff review (0098 also pauses
  // any coach access); it changes nothing else — parent links, children's
  // cards, moments and every other reference stay as they are, because
  // staff may reject the deletion. If staff approve, they complete it with
  // complete_pending_profile_deletion, which runs the clean-up then.
  // admin.deleteUser() is not called: the profile still exists, and the
  // database refuses to delete it around the clean-up.
  if (rpcResult && typeof rpcResult === 'object' && (rpcResult as { canDeleteIdentity?: boolean }).canDeleteIdentity === false) {
    // Staff review and decide these at /staff/account-deletions; this
    // notification tells them a new review round has started.
    // One notification per review round: from 0097 the result carries when
    // the current round began (0098 starts a new round when a request follows
    // a rejection), so a repeat while still pending is not re-sent, but a
    // new request after a rejection reaches staff.
    const reviewOpenedAt = (rpcResult as { reviewOpenedAt?: unknown }).reviewOpenedAt;
    await enqueueAndDispatchStaffNotification(createServiceRoleClient(), {
      eventType: 'auth_deletion_stuck',
      eventKey: typeof reviewOpenedAt === 'string' ? `auth_deletion_stuck:profile:${user.id}:${reviewOpenedAt}` : `auth_deletion_stuck:profile:${user.id}`,
      subjectId: user.id,
      recipientScope: 'all_staff',
      summary: { reason: 'Account deletion needs staff review (records that must be kept). Nothing has been removed yet; reject it or complete it at /staff/account-deletions' },
      linkPath: '/staff/account-deletions',
    });
    await supabase.auth.signOut();
    return NextResponse.json({
      ok: true,
      partial: true,
      identityRetained: true,
      message: deletionReviewResponse(Number((rpcResult as { coachAccessSuspended?: unknown }).coachAccessSuspended) > 0),
      ...rpcResult,
    });
  }

  // Case A (both succeed) vs Case C (DB succeeded, Auth delete fails).
  const serviceRole = createServiceRoleClient();
  const { error: authDeleteError } = await serviceRole.auth.admin.deleteUser(user.id);
  if (authDeleteError) {
    const nowIso = new Date().toISOString();
    // The account is erased: the retry record keeps the auth user id only,
    // never the email, and the stored error text has any address removed.
    const lastError = redactEmails(authDeleteError.message ?? 'Auth user deletion failed');
    const { data: existing } = await serviceRole
      .from('pending_auth_deletions')
      .select('id, attempts')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (existing) {
      await serviceRole
        .from('pending_auth_deletions')
        .update({ last_attempted_at: nowIso, attempts: existing.attempts + 1, last_error: lastError, email: null })
        .eq('id', existing.id);
    } else {
      await serviceRole
        .from('pending_auth_deletions')
        .insert({ auth_user_id: user.id, email: null, first_attempted_at: nowIso, last_attempted_at: nowIso, last_error: lastError });
      // Only on the first occurrence — a retry (the `existing` branch
      // above) reuses the same row and must not re-notify every attempt.
      await enqueueAndDispatchStaffNotification(serviceRole, {
        eventType: 'auth_deletion_stuck',
        eventKey: `auth_deletion_stuck:${user.id}`,
        subjectId: user.id,
        recipientScope: 'all_staff',
        summary: { reason: 'Sign-in identity could not be deleted after data cleanup succeeded' },
        linkPath: '/staff/pending-auth-deletions',
      });
    }

    // Revoke this session regardless of the Auth identity row's fate —
    // see the function doc comment for why this is unconditional.
    await supabase.auth.signOut();

    return NextResponse.json({
      ok: true,
      partial: true,
      message: "Your account data has been removed. We're still finishing the revocation of your sign-in. This is handled automatically, no action needed from you.",
      ...(typeof rpcResult === 'object' ? rpcResult : {}),
    });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true, partial: false, ...(typeof rpcResult === 'object' ? rpcResult : {}) });
}
