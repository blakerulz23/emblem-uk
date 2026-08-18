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
  // Club-mediated verification only — the organiser already knows their real
  // squad, so a bounded identifier (the same first-name + last-initial shown
  // on the card itself, nothing more) lets them notice a name that doesn't
  // belong. Never the photo, full surname, DOB or any other field; excludes
  // 'started' participations since display_first_name is only ever set once
  // a parent actually reaches commit.
  const { data: joined } = await service.from('squad_invite_participations')
    .select('display_first_name,display_surname_initial')
    .eq('campaign_id', campaign.id).not('display_first_name', 'is', null);
  const joinedPlayers = (joined ?? []).map((p) => ({ firstName: p.display_first_name, surnameInitial: p.display_surname_initial }));
  // Never photo_key — this is the organiser's own submission, but the
  // dashboard response only ever needs enough to show status, same
  // never-more-than-necessary boundary as everything else this route returns.
  const { data: coachCardRow } = await service.from('squad_invite_coach_cards')
    .select('full_name,role_title,configuration_status').eq('campaign_id', campaign.id).maybeSingle();
  const coachCard = coachCardRow
    ? { fullName: coachCardRow.full_name, roleTitle: coachCardRow.role_title, configurationStatus: coachCardRow.configuration_status }
    : null;
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
      coachCard,
      joinedPlayers,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
