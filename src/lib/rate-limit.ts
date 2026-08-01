import { createServiceRoleClient } from '@/lib/supabase/server';

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 10;

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

/** True if this identifier is still under the attempt limit for the current window. */
export async function isWithinRateLimit(identifier: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('claim_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .gte('created_at', since);
  return (count ?? 0) < MAX_ATTEMPTS_PER_WINDOW;
}

export async function logClaimAttempt(identifier: string, codeAttempted: string, success: boolean): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from('claim_attempts').insert({ identifier, code_attempted: codeAttempted, success });
}
