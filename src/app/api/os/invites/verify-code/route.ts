import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Verifies the code sent by /api/os/invites/send-code against the invite's
 * stored invited_email (re-derived server-side, never trusted from the
 * client, never logged). On success this establishes a real Supabase
 * session — unlike the shared createClient() in src/lib/supabase/server.ts
 * (which writes cookies via next/headers and relies on Next.js merging
 * that into whatever response is returned later), this route builds its
 * own response-scoped client: the NextResponse is constructed first, and
 * the cookie adapter writes directly onto that exact object, so there's no
 * dependency on implicit framework behavior for something as
 * security-sensitive as an auth session. Confirm this actually works by
 * inspecting the response for Set-Cookie before wiring anything else to
 * it (see the plan's verification section) — this repo has no prior
 * example of an auth-session-establishing call in a Route Handler to lean
 * on.
 *
 * This only authenticates the browser. It does not create a guardians row
 * — that still only happens in the existing POST /api/os/invites/redeem,
 * called afterward once the client has confirmed the session took.
 */
export async function POST(request: NextRequest) {
  const identifier = getRequestIdentifier(request);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const rawCode = typeof body.inviteCode === 'string' ? body.inviteCode : undefined;
  const token = typeof body.token === 'string' ? body.token.trim() : undefined;
  if (!rawCode || !token) {
    return NextResponse.json({ error: 'inviteCode and token are required' }, { status: 400 });
  }
  const code = normalizeClaimCode(rawCode);

  const serviceRole = createServiceRoleClient();
  const { data: invite } = await serviceRole
    .from('player_invites')
    .select('used_at, expires_at, invited_email')
    .eq('code', code)
    .maybeSingle();

  const valid = !!invite && !invite.used_at && new Date(invite.expires_at) > new Date() && !!invite.invited_email;
  await logClaimAttempt(identifier, code, valid);

  if (!valid) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  // Constructed first — the cookie adapter below writes onto this exact
  // object, not a separately-created one, so nothing can discard the
  // Set-Cookie header verifyOtp's setAll produces.
  const response = NextResponse.json({ ok: true });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    email: invite!.invited_email!,
    token,
    type: 'email',
  });

  if (error) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  return response;
}
