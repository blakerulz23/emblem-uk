import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createGuardianInvite } from '@/lib/create-guardian-invite';
import { createTeamInvite } from '@/lib/create-team-invite';
import { currentUkFootballSeason } from '@/lib/season';

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
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const serviceRole = createServiceRoleClient();

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
      const { data: newTeam, error: teamError } = await serviceRole
        .from('teams')
        .insert({ club_id: clubId, name: team.name.trim(), season: team.season?.trim() || currentUkFootballSeason() })
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
