import { createServiceRoleClient } from '@/lib/supabase/server';

export const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS_PER_WINDOW = 10;

/** The one message every limited route returns with a 429. */
export const RATE_LIMIT_MESSAGE = `Too many attempts. Please wait ${RATE_LIMIT_WINDOW_MINUTES} minutes, then try again.`;

/**
 * Best-effort caller identifier — a claim code lookup has no session yet, so
 * IP is what's available. Typed structurally (not as the full Request) so
 * both an API route's NextRequest and a Server Component's next/headers()
 * result satisfy it — src/app/os/page.tsx's server-side card-tap redirect
 * needs the same identifier without a Request object to hand.
 */
export function getRequestIdentifier(headersLike: { get(name: string): string | null }): string {
  const forwarded = headersLike.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || headersLike.get('x-real-ip') || 'unknown';
}

/**
 * True if this identifier is still under the limit for the current window.
 *
 * Only FAILED attempts count (wrong, used or expired codes; wrong sign-in
 * codes). Guessing produces failures, so brute force is still stopped after
 * 10 in 15 minutes, but a parent going through a legitimate multi-step flow
 * (open link, look up, send code, verify, redeem: each logged as a success)
 * no longer uses up the allowance. Before this, those successes counted and
 * a normal invite acceptance could hit the limit (finding F1, 10 Nov 2026).
 */
export async function isWithinRateLimit(identifier: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('claim_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('success', false)
    .gte('created_at', since);
  return (count ?? 0) < MAX_FAILED_ATTEMPTS_PER_WINDOW;
}

export async function logClaimAttempt(identifier: string, codeAttempted: string, success: boolean): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('claim_attempts').insert({ identifier, code_attempted: codeAttempted, success });
}
