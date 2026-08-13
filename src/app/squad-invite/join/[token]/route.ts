import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SQUAD_INVITE_LINK_COOKIE, UNAVAILABLE_INVITATION, hashSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  if (!(await consumeSquadInviteRateLimit(request.headers, 'resolve'))) {
    return NextResponse.json(UNAVAILABLE_INVITATION, { status: 429 });
  }
  let hash: string;
  try { hash = hashSquadInviteLinkToken(params.token); }
  catch { return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 }); }
  const { data, error } = await createServiceRoleClient().rpc('resolve_squad_invite_link', { p_token_hash: hash });
  if (error || !data) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 });
  const response = NextResponse.redirect(new URL('/squad-invite/join', request.url));
  response.cookies.set(SQUAD_INVITE_LINK_COOKIE, params.token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/squad-invite', maxAge: 60 * 60 * 24,
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}
