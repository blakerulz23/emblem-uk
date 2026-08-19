import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { buildNfcCardUrl } from '@/lib/nfc-link';
import { sendSquadInviteCardClaimReminderEmail } from '@/lib/send-squad-invite-card-claim-reminder-email';

export const runtime = 'nodejs';

/**
 * Staff-triggered only — see send-squad-invite-card-claim-reminder-email.ts's
 * header comment for why this isn't automatic on any production_status
 * transition (none of them reliably mean "physically shipped" today).
 * Scoped to orders.source==='squad_invite' specifically: normal orders
 * already get a claim code by email at approval time via
 * createGuardianInvite/createTeamInvite (a separate, pre-existing flow)
 * — this route must never duplicate or interfere with that.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }
  const service = createServiceRoleClient();
  const { data: card } = await service.from('cards')
    .select('id,claim_token,status,order_id,card_definitions(team)')
    .eq('id', params.id).maybeSingle();
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  // Not an error — the staff queue's own button rendering already hides
  // this action once a card is claimed (page.tsx: `c.status !== 'claimed'`),
  // so the only way to reach this branch is stale page state (the parent
  // claimed via the early-preview/pricing-confirmed link after this page
  // loaded, before staff clicked). A quiet, successful skip rather than a
  // 400 — there is genuinely nothing wrong here, just nothing left to do:
  // the guardian already has full Player OS access, so no email is owed.
  if (card.status === 'claimed') return NextResponse.json({ ok: true, skipped: 'already_claimed' });

  const { data: order } = await service.from('orders').select('purchaser_email,source').eq('id', card.order_id).maybeSingle();
  if (!order || order.source !== 'squad_invite') {
    return NextResponse.json({ error: 'This action is only available for Squad Invite cards' }, { status: 400 });
  }
  if (!order.purchaser_email) return NextResponse.json({ error: 'No guardian email on file for this card' }, { status: 409 });

  const definitionRaw = card.card_definitions as unknown;
  const definition = (Array.isArray(definitionRaw) ? definitionRaw[0] : definitionRaw) as { team: string } | null;
  const teamName = definition?.team || 'your team';

  const { ok } = await sendSquadInviteCardClaimReminderEmail({
    toEmail: order.purchaser_email,
    teamName,
    claimUrl: buildNfcCardUrl(card.claim_token),
  });
  if (!ok) return NextResponse.json({ error: 'The reminder email could not be sent right now' }, { status: 500 });

  const { error: updateError } = await service.from('cards').update({ claim_reminder_sent_at: new Date().toISOString() }).eq('id', params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
