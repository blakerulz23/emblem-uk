import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAndDispatchStaffNotification } from '@/lib/dispatch-staff-notification';

/**
 * The one deliberate exception to this feature's "instant, per event"
 * design (see migration 0082's own header comment) — nothing *happens* at
 * the moment a payment_deadline_at lapses; time just passes. Everything
 * else in this notification system fires from an actual write; this is
 * the one case that has to be detected periodically instead.
 *
 * Protected by CRON_SECRET, same unauthenticated-machine-to-machine
 * pattern as sweep-abandoned-uploads/route.ts and sweep-expired-artwork/
 * route.ts — never requireStaff()/RLS, since Vercel Cron is never a
 * browser call.
 *
 * Groups by campaign, not one notification per overdue participation — a
 * campaign with 15 parents who all missed the same 72-hour window would
 * otherwise spam staff with 15 emails for what is, from a staff
 * perspective, one thing to look at. Date-scoped idempotency key per
 * campaign: while a campaign still has overdue payments, it notifies at
 * most once per calendar day the cron runs — a deliberate simplification
 * over tracking exactly "newly overdue since the last run," which would
 * need additional state this table doesn't carry.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data: overdue } = await service
    .from('squad_invite_participations')
    .select('campaign_id')
    .eq('status', 'payment_requested')
    .lt('payment_deadline_at', nowIso);

  const overdueCountByCampaign = new Map<string, number>();
  for (const row of overdue ?? []) {
    const campaignId = row.campaign_id as string;
    overdueCountByCampaign.set(campaignId, (overdueCountByCampaign.get(campaignId) ?? 0) + 1);
  }

  let campaignsNotified = 0;
  const today = nowIso.slice(0, 10);
  for (const [campaignId, count] of Array.from(overdueCountByCampaign)) {
    const { data: campaign } = await service.from('squad_invites').select('club_team_name').eq('id', campaignId).maybeSingle();
    const { data: matchedRequest } = await service.from('squad_invite_requests').select('public_reference').eq('campaign_id', campaignId).maybeSingle();
    if (!matchedRequest?.public_reference) continue;

    const { enqueued } = await enqueueAndDispatchStaffNotification(service, {
      eventType: 'squad_invite_payments_overdue',
      eventKey: `squad_invite_payments_overdue:${campaignId}:${today}`,
      subjectId: campaignId,
      recipientScope: 'squad_invite_approver',
      summary: { teamName: campaign?.club_team_name ?? '', overdueCount: count, reference: matchedRequest.public_reference },
      linkPath: `/staff/squad-invites/${encodeURIComponent(matchedRequest.public_reference)}`,
    });
    if (enqueued) campaignsNotified += 1;
  }

  return NextResponse.json({ ok: true, campaignsWithOverduePayments: overdueCountByCampaign.size, campaignsNotified });
}
