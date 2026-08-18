import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { SQUAD_INVITE_LINK_COOKIE, assertSafeSquadInviteProjection, hashSquadInviteLinkToken } from '@/lib/squad-invite-link';
import JoinSquadInvite from './JoinSquadInvite';
import { headers } from 'next/headers';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';
import { SQUAD_INVITE_CSRF_COOKIE } from '@/lib/squad-invite-request-security';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Join this Squad Invite | Emblem', robots: { index: false, follow: false } };

export default async function JoinSquadInvitePage() {
  if (!(await consumeSquadInviteRateLimit(headers(), 'resolve'))) notFound();
  const token = cookies().get(SQUAD_INVITE_LINK_COOKIE)?.value;
  const csrfToken = cookies().get(SQUAD_INVITE_CSRF_COOKIE)?.value;
  if (!csrfToken) notFound();
  let hash: string;
  try { hash = hashSquadInviteLinkToken(token ?? ''); } catch { notFound(); }
  const { data, error } = await createServiceRoleClient().rpc('resolve_squad_invite_link', { p_token_hash: hash });
  if (error || !data) notFound();
  let invitation;
  try { invitation = assertSafeSquadInviteProjection(data as Record<string, unknown>); } catch { notFound(); }
  return <JoinSquadInvite invitation={invitation} csrfToken={csrfToken} />;
}
