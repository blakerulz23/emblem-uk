import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasSquadInviteContextCookie, hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';

const GENERIC = { ok: true, message: 'If the address can receive a code, it will arrive shortly.' } as const;

export async function POST(request: NextRequest) {
  if (!hasSquadInviteContextCookie(request) || !hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 254 || !email.includes('@')) return NextResponse.json(GENERIC);
  if (!(await consumeSquadInviteRateLimit(request.headers, 'otp-request', email))) {
    return NextResponse.json(GENERIC, { status: 429 });
  }
  const { error } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    // Never log the address or any Supabase message/hint/detail — only a
    // stable route label and whatever safe status/code the AuthError
    // exposes. This is a system-level failure signal (rate limit hit,
    // mailer down), not an email-existence signal: signInWithOtp with
    // shouldCreateUser:true does not error differently for an existing
    // vs. non-existing address, so returning a distinct status here does
    // not reopen the enumeration this route otherwise guards against.
    console.error('squad-invite-auth/request-code:signInWithOtp', error.status ?? error.code ?? 'unknown');
    return NextResponse.json(
      { ok: false, error: 'We could not request a verification code right now. Please try again shortly.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(GENERIC, { headers: { 'Cache-Control': 'no-store' } });
}
