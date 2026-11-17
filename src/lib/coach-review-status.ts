import type { OsView } from '@/lib/os-view';

/**
 * A signed-in account's own deletion review, as my_account_deletion_review()
 * (migration 0098) reports it: only auth.uid()'s own request, nothing else.
 */
export type DeletionReviewState = { underReview: boolean; coachAccessPaused: boolean };

type RpcClient = { rpc: (fn: 'my_account_deletion_review') => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Reads the account's own review status. Any failure reads as "unknown"
 * (null), which leaves /os exactly as it behaved before this screen existed.
 */
export async function readDeletionReview(supabase: RpcClient): Promise<DeletionReviewState | null> {
  try {
    const { data, error } = await supabase.rpc('my_account_deletion_review');
    if (error || !data || typeof data !== 'object') return null;
    const r = data as { underReview?: unknown; coachAccessPaused?: unknown };
    return { underReview: r.underReview === true, coachAccessPaused: r.coachAccessPaused === true };
  } catch {
    return null;
  }
}

/**
 * The coach-only account under review: signed in, no parent or coach view
 * (0098 paused every coach access and there are no guardian links), and a
 * pending deletion review for a coach account. Without this, /os showed the
 * coach team-request onboarding, which the database refuses during review
 * and which has no way to sign out.
 *
 * Deliberately narrow: an account that still has a view keeps it (its own
 * Account Settings already shows the review), and a non-coach account under
 * review keeps today's onboarding.
 */
export function showsCoachReviewScreen({
  hasSession,
  view,
  profileRole,
  deletionReview,
}: {
  hasSession: boolean;
  view: OsView | null;
  profileRole: OsView | null;
  deletionReview: DeletionReviewState | null | undefined;
}): boolean {
  if (!hasSession || view !== null || !deletionReview?.underReview) return false;
  return deletionReview.coachAccessPaused || profileRole === 'coach';
}

/**
 * Sign out, then a hard navigation to /os (the signed-out start screen), as
 * Account Settings does. A failed or thrown sign-out still navigates: the
 * client has cleared its local session either way, so the person is never
 * left on this screen with nothing to do.
 */
export async function signOutToStart(deps: { signOut: () => Promise<unknown>; navigate: (path: string) => void }): Promise<void> {
  try {
    await deps.signOut();
  } catch {
    // fall through to the navigation
  }
  deps.navigate('/os');
}
