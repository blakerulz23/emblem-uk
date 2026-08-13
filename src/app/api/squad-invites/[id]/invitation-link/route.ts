import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { createSquadInviteLinkToken } from '@/lib/squad-invite-link';

async function authorisedCampaign(userId: string, campaignId: string) {
  const service = createServiceRoleClient();
  const [{ data: campaign }, { data: staff }] = await Promise.all([
    service.from('squad_invites').select('id,organiser_profile_id,grace_ends_at').eq('id', campaignId).maybeSingle(),
    service.from('staff_accounts').select('profile_id').eq('profile_id', userId).maybeSingle(),
  ]);
  return campaign && (campaign.organiser_profile_id === userId || Boolean(staff)) ? campaign : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const campaign = await authorisedCampaign(user.id, params.id);
  if (!campaign) return NextResponse.json({ error: 'Campaign unavailable' }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { participationLimit?: number };
  const limit = body.participationLimit;
  if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return NextResponse.json({ error: 'Invalid participation limit' }, { status: 400 });
  }
  const credential = createSquadInviteLinkToken();
  const { error } = await createServiceRoleClient().rpc('replace_squad_invite_link', {
    p_campaign_id: campaign.id, p_actor_profile_id: user.id, p_token_hash: credential.hash,
    p_expires_at: campaign.grace_ends_at, p_participation_limit: limit ?? null,
  });
  if (error) return NextResponse.json({ error: 'Invitation link could not be replaced' }, { status: 409 });
  return NextResponse.json({ invitationPath: `/squad-invite/join/${credential.token}` });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const campaign = await authorisedCampaign(user.id, params.id);
  if (!campaign) return NextResponse.json({ error: 'Campaign unavailable' }, { status: 404 });
  const body = await request.json().catch(() => null) as { status?: 'active'|'paused'|'revoked' } | null;
  if (!body || !['active','paused','revoked'].includes(body.status ?? '')) return NextResponse.json({ error: 'Invalid link status' }, { status: 400 });
  const service = createServiceRoleClient();
  const update = body.status === 'revoked' ? { status: body.status, revoked_at: new Date().toISOString() } : { status: body.status, revoked_at: null };
  const { data, error } = await service.from('squad_invite_links').update(update).eq('campaign_id', campaign.id)
    .in('status', ['active','paused']).select('id').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Invitation link unavailable' }, { status: 404 });
  await service.from('squad_invite_link_audit_events').insert({
    link_id: data.id, campaign_id: campaign.id, actor_profile_id: user.id,
    event_type: body.status === 'active' ? 'resumed' : body.status,
  });
  return NextResponse.json({ ok: true, status: body.status });
}
