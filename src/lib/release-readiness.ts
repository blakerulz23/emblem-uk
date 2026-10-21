/**
 * Release readiness for database contract changes (migration 0088).
 *
 * Migration 0089 removes the signed-in session's direct writes to
 * relationships and roles, so it may only run once an application that no
 * longer needs them is deployed and verified. This build declares that it is
 * that application; a staff member records the confirmation through
 * POST /api/staff/release-readiness after the smoke checks below pass, and
 * 0089 refuses to run without that record.
 */
export const AUTHORIZATION_RELATIONSHIPS_CONTRACT = 'authorization_relationships_v1';

/** The smoke checks a staff member must confirm, in the order the database function takes them. */
export const AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS = [
  'cardClaim',
  'guardianInvite',
  'teamInvite',
  'coachInvite',
  'dualView',
  'teamRequestFlow',
] as const;

export type SmokeCheck = (typeof AUTHORIZATION_RELATIONSHIPS_SMOKE_CHECKS)[number];

/**
 * The deployed commit, from the deployment platform (Vercel sets
 * VERCEL_GIT_COMMIT_SHA for every build). Never taken from a request.
 * Null when it isn't available (for example a local build).
 */
export function deployedAppCommit(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
  return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}
