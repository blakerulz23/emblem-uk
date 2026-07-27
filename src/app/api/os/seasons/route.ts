import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveOrCreateSeason } from '@/lib/resolve-season';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Lists active seasons — feeds the season picker on both team-creation
 * entry points. Relies on the "seasons: readable by authenticated
 * users" RLS policy.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('seasons')
    .select('id, label, status')
    .eq('status', 'active')
    .order('label', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ seasons: data ?? [] });
}

/**
 * Creates or reuses a season by label — the client-facing entry point
 * for the coach self-onboarding flow (CreateTeamOnboarding.tsx). seasons
 * has no authenticated insert policy at all (matches cards' "secure by
 * default" convention), so this uses the service-role client, after its
 * own auth check — resolveOrCreateSeason itself does no authentication
 * or authorization, that's this route's job, not the helper's.
 *
 * Rate-limited via the existing claim_attempts mechanism rather than a
 * new dependency — code_attempted holds the attempted label here, not a
 * real claim code, a deliberate reuse of the existing shape rather than
 * a new table for one more endpoint.
 *
 * status/starts_on/ends_on are never accepted from the request body —
 * every new season starts 'active' with no dates, full stop.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const identifier = getRequestIdentifier(request);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const label = typeof body.label === 'string' ? body.label : '';

  const serviceRole = createServiceRoleClient();
  const result = await resolveOrCreateSeason(serviceRole, label);
  await logClaimAttempt(identifier, label, result.ok);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.id, label: result.label });
}
