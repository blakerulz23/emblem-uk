import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

/**
 * Ordinary-builder Adult Permission step, request-code. Same
 * signInWithOtp-based construction as squad-invite-auth/request-code —
 * proves control of the adult's email address, nothing more — with the
 * builder's own CSRF cookie (already set on every /builder visit by
 * middleware) rather than Squad Invite's separate one.
 */
const GENERIC = { ok: true, message: 'If the address can receive a code, it will arrive shortly.' } as const;

export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length < 3 || email.length > 254 || !email.includes('@')) return NextResponse.json(GENERIC);
  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'builder-authority-otp-request', email))) {
    return NextResponse.json(GENERIC, { status: 429 });
  }
  const { error } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    // Never log the address or any Supabase message/hint/detail — only a
    // stable route label and whatever safe status/code the AuthError
    // exposes, same discipline as squad-invite-auth/request-code.
    console.error('builder-authority/request-code:signInWithOtp', error.status ?? error.code ?? 'unknown');
    return NextResponse.json(
      { ok: false, error: 'We could not request a verification code right now. Please try again shortly.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(GENERIC, { headers: { 'Cache-Control': 'no-store' } });
}
