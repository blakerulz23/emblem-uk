import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createBuilderToken, effectiveCampaignStatus, mayStartBuilder } from '@/lib/squad-invite';

export async function POST(_request: NextRequest, { params }: { params: { publicId: string } }) {
  const service = createServiceRoleClient();
  const { data: campaign } = await service.from('squad_invites').select('id,campaign_status,deadline_at')
    .eq('public_id', params.publicId).maybeSingle();
  if (!campaign || !mayStartBuilder(effectiveCampaignStatus(campaign.campaign_status, campaign.deadline_at))) {
    return NextResponse.json({ error: 'New builders are closed' }, { status: 409 });
  }
  const credential = createBuilderToken();
  const { data, error } = await service.from('squad_invite_participations').insert({ campaign_id: campaign.id, builder_token_hash: credential.hash })
    .select('id').single();
  if (error || !data) return NextResponse.json({ error: 'Could not start builder' }, { status: 500 });
  await service.from('squad_invite_audit_events').insert({ campaign_id: campaign.id, participation_id: data.id, actor_role: 'public', event_type: 'builder_started' });
  return NextResponse.json({ participationId: data.id, builderToken: credential.token }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
