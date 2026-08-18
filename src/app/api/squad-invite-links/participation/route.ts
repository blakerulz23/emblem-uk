import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createBuilderToken } from '@/lib/squad-invite';
import { SQUAD_INVITE_LINK_COOKIE, UNAVAILABLE_INVITATION, hashSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { headers } from 'next/headers';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';

export async function POST(request: NextRequest) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 403 });
  if (!(await consumeSquadInviteRateLimit(headers(), 'participate'))) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 429 });
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Email verification required', returnTo: '/squad-invite/join' }, { status: 401 });
  const token = cookies().get(SQUAD_INVITE_LINK_COOKIE)?.value;
  let linkHash: string;
  try { linkHash = hashSquadInviteLinkToken(token ?? ''); }
  catch { return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 }); }
  const builder = createBuilderToken();
  const { data, error } = await createServiceRoleClient().rpc('start_squad_invite_participation', {
    p_token_hash: linkHash, p_guardian_profile_id: user.id, p_builder_token_hash: builder.hash,
  });
  if (error || !data) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 });
  const result = data as { participationId: string; created: boolean };
  const response = NextResponse.json({ participationId: result.participationId, created: result.created });
  response.cookies.set('emblem_squad_builder', builder.token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 48,
  });
  return response;
}
