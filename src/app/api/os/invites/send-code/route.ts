import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Sends a sign-in code directly to an invite's stored `invited_email` —
 * the browser never sees or supplies the real address (only the masked
 * display value from GET /api/os/invites/redeem). This only requests
 * delivery; signInWithOtp does not establish a session, so there's no
 * cookie to write here — verify-code is where that happens.
 *
 * Always responds { ok: true } regardless of whether the code was
 * actually valid or had an email on file, matching the lookup route's
 * non-disclosure shape — the client can't distinguish "sent" from
 * "invalid/expired/no email" from the response alone.
 */
export async function POST(request: NextRequest) {
  const identifier = getRequestIdentifier(request);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const rawCode = typeof body.inviteCode === 'string' ? body.inviteCode : undefined;
  if (!rawCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
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

  if (valid) {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: invite!.invited_email! });
    if (error) {
      // Never logs the address itself — the code is enough to trace this
      // in claim_attempts if needed.
      console.warn('send-code: signInWithOtp failed for invite', code);
    }
  }

  return NextResponse.json({ ok: true });
}
