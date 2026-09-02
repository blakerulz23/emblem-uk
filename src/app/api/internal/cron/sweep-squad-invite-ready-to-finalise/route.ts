import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

/**
 * Notifies staff once a campaign becomes ready to finalise pricing — see
 * migration 0083's own header comment for why this needs a periodic sweep
 * rather than firing from a write, same reasoning as
 * sweep-squad-invite-overdue-payments/route.ts.
 *
 * Mirrors finalise_squad_invite_pricing's own gate (0050/0066) and
 * FinalisePricingButton's display-only preview of it: campaign_status not
 * in ('cancelled','expired'), not yet finalised, grace period ended (or
 * the organiser closed early), and at least one commitment_completed
 * participation — this route is a detector only, never the authority;
 * finalising itself still only happens via the existing staff-triggered
 * finalise-pricing endpoint.
 *
 * Unlike the overdue-payments sweep, the idempotency key here is NOT
 * date-scoped — a campaign becomes eligible exactly once and stays
 * eligible until finalised, so one notification per campaign, ever, is
 * correct; re-running this sweep daily while a campaign sits unfinalised
 * must not re-notify.
 *
 * Protected by CRON_SECRET, same unauthenticated-machine-to-machine
 * pattern as every other sweep cron route in this codebase.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: candidates } = await service
    .from('squad_invites')
    .select('id, club_team_name, campaign_status, grace_ends_at')
    .is('pricing_finalised_at', null);

  let campaignsNotified = 0;
  let campaignsReady = 0;

  for (const campaign of candidates ?? []) {
    if (campaign.campaign_status === 'cancelled' || campaign.campaign_status === 'expired') continue;
    const graceSatisfied = campaign.campaign_status === 'closed' || (campaign.grace_ends_at !== null && campaign.grace_ends_at <= nowIso);
    if (!graceSatisfied) continue;

    const { count: eligibleCount } = await service
      .from('squad_invite_participations')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('status', 'commitment_completed');
    if (!eligibleCount || eligibleCount < 1) continue;

    const { data: matchedRequest } = await service.from('squad_invite_requests').select('public_reference').eq('campaign_id', campaign.id).maybeSingle();
    if (!matchedRequest?.public_reference) continue;

    campaignsReady += 1;
    const { enqueued } = await enqueueAndDispatchStaffNotification(service, {
      eventType: 'squad_invite_ready_to_finalise',
      eventKey: `squad_invite_ready_to_finalise:${campaign.id}`,
      subjectId: campaign.id,
      recipientScope: 'squad_invite_approver',
      summary: { teamName: campaign.club_team_name ?? '', eligibleCommitments: eligibleCount, reference: matchedRequest.public_reference },
      linkPath: `/staff/squad-invites/${encodeURIComponent(matchedRequest.public_reference)}`,
    });
    if (enqueued) campaignsNotified += 1;
  }

  return NextResponse.json({ ok: true, campaignsReady, campaignsNotified });
}
