import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const service = createServiceRoleClient();
  const { data: campaign } = await service.from('squad_invites')
    .select('id,organiser_profile_id,club_team_name,football_age_group,deadline_at,grace_ends_at,campaign_status,payment_phase,fulfilment_status,final_tier,final_unit_price_pence,final_commitment_count,coach_card_eligible')
    .eq('id', params.id).eq('organiser_profile_id', user.id).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign unavailable' }, { status: 404 });
  const statuses = ['started','commitment_completed','payment_requested','paid','payment_expired'] as const;
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count } = await service.from('squad_invite_participations').select('id', { head: true, count: 'exact' })
      .eq('campaign_id', campaign.id).eq('status', status);
    counts[status] = count ?? 0;
  }
  return NextResponse.json({
    campaign: {
      teamName: campaign.club_team_name, ageGroup: campaign.football_age_group,
      deadlineAt: campaign.deadline_at, graceEndsAt: campaign.grace_ends_at,
      campaignStatus: campaign.campaign_status, paymentPhase: campaign.payment_phase,
      fulfilmentStatus: campaign.fulfilment_status, finalTier: campaign.final_tier,
      finalUnitPricePence: campaign.final_unit_price_pence,
      completedCommitments: campaign.final_commitment_count ?? counts.commitment_completed,
      paymentsConfirmed: counts.paid, squadPriceUnlocked: campaign.final_tier === 'squad',
      freeCoachCardConfirmed: campaign.coach_card_eligible,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
