import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SQUAD_INVITE_LINK_COOKIE, UNAVAILABLE_INVITATION, assertSafeSquadInviteProjection, hashSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { headers } from 'next/headers';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';

export async function GET() {
  if (!(await consumeSquadInviteRateLimit(headers(), 'resolve'))) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 429 });
  const token = cookies().get(SQUAD_INVITE_LINK_COOKIE)?.value;
  let hash: string;
  try { hash = hashSquadInviteLinkToken(token ?? ''); }
  catch { return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 }); }
  const { data, error } = await createServiceRoleClient().rpc('resolve_squad_invite_link', { p_token_hash: hash });
  if (error || !data) return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 });
  let projection;
  try { projection = assertSafeSquadInviteProjection(data as Record<string, unknown>); }
  catch { return NextResponse.json(UNAVAILABLE_INVITATION, { status: 404 }); }
  return NextResponse.json(projection, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
