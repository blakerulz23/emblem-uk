import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';

/**
 * The reverse of close (see close/route.ts) — organiser-only, ownership
 * verified inside reopen_squad_invite_campaign itself. That function is
 * also the one place the hard guard lives: once pricing has been
 * finalised, reopening is refused outright — this route has no
 * awareness of pricing state at all, it just relays the RPC's decision.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!(await consumeSquadInviteRateLimit(headers(), 'campaign-reopen', user.id))) {
    return NextResponse.json({ error: 'Please wait before trying again' }, { status: 429 });
  }
  const { data, error } = await createServiceRoleClient().rpc('reopen_squad_invite_campaign', {
    p_campaign_id: params.id, p_actor_profile_id: user.id,
  });
  if (error || !data) return NextResponse.json({ error: 'This campaign could not be reopened' }, { status: 409 });
  return NextResponse.json({ ok: true, campaignStatus: data.campaignStatus });
}
