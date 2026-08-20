import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { hasValidSquadInviteCsrf } from '@/lib/squad-invite-request-security';
import { consumeSquadInviteRateLimit } from '@/lib/squad-invite-rate-limit';

/**
 * Organiser-only, self-service — the whole point of this action is that
 * it doesn't need a staff member. Ownership is verified inside
 * close_squad_invite_campaign itself (migration 0066), not just trusted
 * from this route, given the weight of the action. This is what makes
 * commit_squad_invite_participation_order start rejecting new commits
 * immediately — 'closed' was never in that function's allow-list.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasValidSquadInviteCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!(await consumeSquadInviteRateLimit(headers(), 'campaign-close', user.id))) {
    return NextResponse.json({ error: 'Please wait before trying again' }, { status: 429 });
  }
  const { data, error } = await createServiceRoleClient().rpc('close_squad_invite_campaign', {
    p_campaign_id: params.id, p_actor_profile_id: user.id,
  });
  if (error || !data) return NextResponse.json({ error: 'This campaign could not be closed' }, { status: 409 });
  return NextResponse.json({ ok: true, campaignStatus: data.campaignStatus });
}
