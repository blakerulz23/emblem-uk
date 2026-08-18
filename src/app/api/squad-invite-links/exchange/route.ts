import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SQUAD_INVITE_LINK_COOKIE, UNAVAILABLE_INVITATION, hashSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { SQUAD_INVITE_CSRF_COOKIE, hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';

export async function POST(request: NextRequest) {
  const unavailable = () => NextResponse.json(UNAVAILABLE_INVITATION, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!hasSafeRequestOrigin(request)) return unavailable();
  if (!(await consumeSquadInviteRateLimit(request.headers, 'resolve'))) return unavailable();
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  let hash: string;
  try { hash = hashSquadInviteLinkToken(token); } catch { return unavailable(); }
  const { data, error } = await createServiceRoleClient().rpc('resolve_squad_invite_link', { p_token_hash: hash });
  if (error || !data) return unavailable();
  const csrfToken = randomBytes(32).toString('base64url');
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(SQUAD_INVITE_LINK_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 });
  response.cookies.set(SQUAD_INVITE_CSRF_COOKIE, csrfToken, { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 });
  return response;
}
