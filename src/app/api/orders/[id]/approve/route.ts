import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';
import { createTeamInvite } from '@/lib/create-team-invite';
import { currentUkFootballSeason } from '@/lib/season';
import { resolveOrCreateSeason } from '@/lib/resolve-season';

export const runtime = 'nodejs';

type ClubChoice = { mode: 'existing'; id: string } | { mode: 'new'; name: string };
type TeamChoice = { mode: 'existing'; id: string } | { mode: 'new'; name: string; season: string };

/**
 * The one staff action that unblocks claiming for an order's cards — flips
 * an order to 'fulfilled'. A bare Shopify redirect or a submitted enquiry
 * is never itself proof of purchase, so this manual step is what actually
 * makes a card's claim_token start resolving as claimable.
 *
 * Gated on requireStaff — approving an order now also triggers a real
 * customer-facing email for single-card orders, so this can no longer be
 * the unauthenticated "Internal · Staff only" convention it used to be.
 *
 * Single-recipient detection is based on how many cards are actually
 * linked to the order, not `orders.source`. That field no longer reflects
 * live reality: every order placed through the current builder — one card
 * or a full squad — is recorded as 'team_order' ('standalone_order' is
 * dead; its only creator, PrintFileBlock.tsx, isn't mounted anywhere in
 * the app). A single linked card is still the same unambiguous
 * one-purchaser-one-recipient case the old standalone flow meant to
 * capture — the field just isn't reliable anymore, the count is.
 *
 * More than one linked card: a squad order. The purchaser/coach never
 * gets emailed a bundle of child claim links (unchanged) — instead this
 * route resolves the order to a real team (staff picks or creates a
 * club/team in the request body, since auto-matching a typed club name
 * risks silently merging two different real clubs — see migration
 * 0009's reasoning), sets team_id on every one of this order's players,
 * and invites the purchaser into Coach OS for that team. A missing/
 * invalid body on a multi-card order is rejected before anything is
 * written — the human decision is required every time, not optional.
 */
/**
 * Squad Invite orders (orders.source='squad_invite', migration 0055) reuse
 * this same staff approval action to reach production, but must never take
 * the normal-order path below: that path emails a guardian/team claim
 * invite (createGuardianInvite/createTeamInvite) — a second, unrelated
 * claim flow a Squad Invite guardian already has no use for, since they
 * already hold the authenticated participation relationship the card came
 * from. This branch instead: confirms the order is linked to exactly one
 * Squad Invite participation that itself owns the order (the bidirectional
 * order_id link written by commit_squad_invite_participation_order),
 * confirms the campaign hasn't been cancelled/exceptioned, enforces the
 * squad_invite_payment_mode_enabled() policy boundary (a no-op today since
 * it's hardcoded false — see 0055 — but becomes a real gate the moment a
 * future migration flips it), and records a Squad-Invite-specific audit
 * event instead of an invite. It still flips the SAME orders.payment_status
 * column to 'fulfilled' to enter the existing Profile Setup queue — that is
 * a known, documented schema-semantic mismatch (this pilot's cards were
 * never paid), never disguised as anything else in the response or copy.
 */
async function approveSquadInviteOrder(
  serviceRole: ReturnType<typeof createServiceRoleClient>,
  orderId: string,
  staffProfileId: string,
) {
  const { data: participations, error: participationsError } = await serviceRole
    .from('squad_invite_participations')
    .select('id, campaign_id, squad_invites!inner(campaign_status)')
    .eq('order_id', orderId);

  if (participationsError || !participations || participations.length !== 1) {
    return NextResponse.json({ error: 'This order is not linked to exactly one Squad Invite participation' }, { status: 409 });
  }
  const participation = participations[0];
  const campaignRaw = participation.squad_invites as unknown;
  const campaign = (Array.isArray(campaignRaw) ? campaignRaw[0] : campaignRaw) as { campaign_status: string } | undefined;
  if (!campaign || campaign.campaign_status === 'cancelled' || campaign.campaign_status === 'exception') {
    return NextResponse.json({ error: 'This Squad Invite campaign is not eligible for approval' }, { status: 409 });
  }

  const { data: orderRow } = await serviceRole.from('orders').select('id, payment_status').eq('id', orderId).maybeSingle();
  if (!orderRow) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: paymentModeEnabled } = await serviceRole.rpc('squad_invite_payment_mode_enabled');
  if (paymentModeEnabled === true && orderRow.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Payment is required before this can be approved for production' }, { status: 409 });
  }

  const { data: updated, error } = await serviceRole
    .from('orders')
    .update({ payment_status: 'fulfilled', approved_by: staffProfileId, approved_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 500 });
  }

  // Source-specific audit event — never createGuardianInvite/createTeamInvite,
  // never an email. metadata documents that this is an unpaid pilot
  // approval, so nothing downstream can mistake it for a paid confirmation.
  await serviceRole.from('squad_invite_audit_events').insert({
    campaign_id: participation.campaign_id,
    participation_id: participation.id,
    actor_profile_id: staffProfileId,
    actor_role: 'staff',
    event_type: 'fulfilment_started',
    metadata: { action: 'pilot_production_approval', paymentStatus: 'unpaid_pilot' },
  });

  return NextResponse.json({ ok: true, orderId, source: 'squad_invite', productionQueued: true, inviteTriggered: false });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const serviceRole = createServiceRoleClient();

  const { data: sourceRow } = await serviceRole.from('orders').select('source').eq('id', params.id).maybeSingle();
  if (!sourceRow) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (sourceRow.source === 'squad_invite') {
    return approveSquadInviteOrder(serviceRole, params.id, staffCheck.userId);
  }

  const { data: cards } = await serviceRole
    .from('cards')
    .select('player_id')
    .eq('order_id', params.id)
    .not('player_id', 'is', null);

  const linkedCards = cards ?? [];
  let resolvedTeamId: string | null = null;

  if (linkedCards.length > 1) {
    const body = await request.json().catch(() => null);
    const club = body?.club as ClubChoice | undefined;
    const team = body?.team as TeamChoice | undefined;

    if (!club || !team || (club.mode === 'new' && !club.name?.trim()) || (team.mode === 'new' && !team.name?.trim())) {
      return NextResponse.json(
        { error: 'Pick or create a club and team before approving a squad order' },
        { status: 400 }
      );
    }

    let clubId: string;
    if (club.mode === 'existing') {
      clubId = club.id;
    } else {
      const { data: newClub, error: clubError } = await serviceRole
        .from('clubs')
        .insert({ name: club.name.trim() })
        .select('id')
        .single();
      if (clubError || !newClub) {
        return NextResponse.json({ error: clubError?.message ?? 'Could not create club' }, { status: 500 });
      }
      clubId = newClub.id;
    }

    if (team.mode === 'existing') {
      const { data: existingTeam, error: teamLookupError } = await serviceRole
        .from('teams')
        .select('id, club_id')
        .eq('id', team.id)
        .maybeSingle();
      if (teamLookupError || !existingTeam || existingTeam.club_id !== clubId) {
        return NextResponse.json({ error: "That team doesn't belong to the chosen club" }, { status: 400 });
      }
      resolvedTeamId = existingTeam.id;
    } else {
      // Resolves-or-creates by normalized label — safe to do implicitly
      // here (unlike club/team, which need an explicit staff choice to
      // avoid fragmenting/merging real organizations) since seasons are
      // low-cardinality shared reference data; typing the same season
      // twice, even worded slightly differently, reuses the one row
      // rather than creating a duplicate.
      const seasonResult = await resolveOrCreateSeason(serviceRole, team.season?.trim() || currentUkFootballSeason());
      if (!seasonResult.ok) {
        return NextResponse.json({ error: seasonResult.error }, { status: seasonResult.status });
      }

      const { data: newTeam, error: teamError } = await serviceRole
        .from('teams')
        .insert({ club_id: clubId, name: team.name.trim(), season_id: seasonResult.id })
        .select('id')
        .single();
      if (teamError || !newTeam) {
        return NextResponse.json({ error: teamError?.message ?? 'Could not create team' }, { status: 500 });
      }
      resolvedTeamId = newTeam.id;
    }

    const playerIds = linkedCards.map((c) => c.player_id).filter(Boolean) as string[];
    const { error: assignError } = await serviceRole
      .from('players')
      .update({ team_id: resolvedTeamId })
      .in('id', playerIds);
    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }
  }

  const { data: order, error } = await serviceRole
    .from('orders')
    .update({
      payment_status: 'fulfilled',
      approved_by: staffCheck.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, purchaser_email, intended_guardian_email')
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 500 });
  }

  let inviteTriggered = false;

  if (linkedCards.length === 1) {
    const playerId = linkedCards[0].player_id;
    const recipient = order.intended_guardian_email?.trim() || order.purchaser_email?.trim();
    if (playerId && recipient) {
      await createGuardianInvite(serviceRole, playerId, null, recipient, 'order_approval', order.id);
      inviteTriggered = true;
    }
  } else if (linkedCards.length > 1 && resolvedTeamId) {
    const recipient = order.purchaser_email?.trim();
    if (recipient) {
      await createTeamInvite(serviceRole, resolvedTeamId, recipient, order.id);
      inviteTriggered = true;
    }
  }

  return NextResponse.json({ ok: true, orderId: order.id, inviteTriggered });
}
