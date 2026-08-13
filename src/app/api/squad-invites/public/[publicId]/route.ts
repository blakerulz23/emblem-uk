import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { effectiveCampaignStatus } from '@/lib/squad-invite';

export async function GET(_request: NextRequest, { params }: { params: { publicId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.publicId)) return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  const service = createServiceRoleClient();
  const { data } = await service.from('squad_invites')
    .select('id,club_team_name,football_age_group,deadline_at,campaign_status,final_tier,final_unit_price_pence,coach_card_eligible,fulfilment_status,delivery_recipient_name,delivery_recipient_role')
    .eq('public_id', params.publicId).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  const status = effectiveCampaignStatus(data.campaign_status, data.deadline_at);
  if (!['active','grace_period','deadline_reached','pricing_finalised'].includes(status)) {
    return NextResponse.json({ error: 'Invite unavailable' }, { status: 404 });
  }
  const { count } = await service.from('squad_invite_participations').select('id', { head: true, count: 'exact' })
    .eq('campaign_id', data.id).eq('status', 'commitment_completed');
  return NextResponse.json({
    teamName: data.club_team_name, ageGroup: data.football_age_group, deadlineAt: data.deadline_at, status,
    completedCommitments: count ?? 0, finalTier: data.final_tier, finalUnitPricePence: data.final_unit_price_pence,
    squadPriceUnlocked: data.final_tier === 'squad', freeCoachCardConfirmed: data.coach_card_eligible,
    delivery: `Cards will be delivered together to ${data.delivery_recipient_name || data.delivery_recipient_role} for distribution.`,
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
