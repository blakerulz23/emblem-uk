import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { claimPlayerForCard } from '@/lib/claim-player';
import { createGuardianInvite } from '@/lib/create-guardian-invite';
import { ensureProfileRole } from '@/lib/relationship-writes';
import { logRouteFailure, type DbError } from '@/lib/route-failure';
import { checkFirstGuardianClaim } from '@/lib/guardian-invite-eligibility';
import { checkGiftFirstGuardianClaim, GIFT_PROFILE_REFUSED_MESSAGE } from '@/lib/gift-order-guardian';

export const runtime = 'nodejs';

const CARD_SET_NEEDS_VERIFICATION = 'We need to verify this card set before linking it to your account. Please contact Emblem support.';
const RECOVER_FAILED = 'Could not recover this card. Please try again.';

type RecoverCardRow = {
  id: string;
  status: 'unassigned' | 'assigned' | 'claimed';
  access_status: 'suspended' | 'revoked' | null;
  player_id: string | null;
  order_id: string | null;
  players: { name: string } | null;
};

/**
 * Lists this signed-in purchaser's fulfilled orders with at least one
 * unclaimed card. RLS's "orders: purchaser can view their own"
 * (purchaser_email = auth.email()) does the actual gating on the orders
 * query — there's no query param here, only the verified session identity
 * matters. Cards are then fetched via the service-role client scoped to
 * exactly those already-authorized order ids, since `cards`' own RLS only
 * allows a *guardian or coach* to see them — a purchaser who hasn't
 * claimed yet has neither relationship, by design.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_ref, source')
    .eq('payment_status', 'fulfilled');

  if (error) {
    logRouteFailure('recover: list orders', error);
    return NextResponse.json({ error: 'Could not load your orders. Please try again.' }, { status: 500 });
  }
  if (!orders?.length) {
    return NextResponse.json({ orders: [] });
  }

  const serviceRole = createServiceRoleClient();
  const { data: cards } = await serviceRole
    .from('cards')
    .select('id, status, access_status, player_id, order_id, players ( name )')
    .in('order_id', orders.map((o) => o.id))
    .returns<RecoverCardRow[]>();

  const cardsByOrder = new Map<string, RecoverCardRow[]>();
  for (const card of cards ?? []) {
    if (!card.order_id) continue;
    cardsByOrder.set(card.order_id, [...(cardsByOrder.get(card.order_id) ?? []), card]);
  }

  // Exclude a card if it's already claimed, or already has a pending
  // handoff invite outstanding (prevents the purchaser from also
  // self-claiming after choosing "send to the right parent").
  const heldForGuardian = new Set<string>();
  const eligible = await Promise.all(
    orders.map(async (order) => {
      const orderCards = cardsByOrder.get(order.id) ?? [];
      const openCards = await Promise.all(
        orderCards
          .filter((c) => c.status !== 'claimed' && !c.access_status)
          .map(async (c) => {
            const { count } = await serviceRole
              .from('player_invites')
              .select('id', { count: 'exact', head: true })
              .eq('player_id', c.player_id ?? '')
              .is('used_at', null)
              .gt('expires_at', new Date().toISOString());
            if ((count ?? 0) > 0) return null;
            // A gift order's card is listed only for the guardian who
            // approved it; the buyer is told who sets the profile up instead.
            if (c.player_id) {
              const gift = await checkGiftFirstGuardianClaim(serviceRole, c.player_id, user);
              if (gift.outcome === 'refused' || gift.outcome === 'failed') {
                heldForGuardian.add(order.order_ref);
                return null;
              }
            }
            return c;
          })
      );
      return {
        orderId: order.id,
        orderRef: order.order_ref,
        source: order.source,
        // Only a one-card order can be recovered by the purchaser themselves
        // (see POST); a card set needs Emblem to verify each child's guardian.
        verificationRequired: orderCards.length !== 1,
        cards: openCards
          .filter((c): c is RecoverCardRow => c !== null)
          .map((c) => ({ cardId: c.id, playerId: c.player_id, playerName: c.players?.name ?? null })),
      };
    })
  );

  return NextResponse.json({
    orders: eligible.filter((o) => o.cards.length > 0),
    // Order refs only (the buyer's own), never the child or guardian.
    heldForGuardian: Array.from(heldForGuardian),
  });
}

/**
 * `'self'`: the purchaser claims the card themselves (same lock-on-claim
 * behavior as the primary claim path). `'handoff'`: creates a guardian
 * invite for the real parent instead — the purchaser never gains access.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { cardId, decision, handoffEmail } = body as {
    cardId?: string;
    decision?: 'self' | 'handoff';
    handoffEmail?: string;
  };

  if (!cardId || (decision !== 'self' && decision !== 'handoff')) {
    return NextResponse.json({ error: 'cardId and a valid decision are required' }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();

  // Re-verify this card belongs to a fulfilled order for *this* purchaser's
  // verified email — the same RLS-equivalent check the GET above relies on,
  // done explicitly here since this write uses the service-role client.
  const { data: card } = await serviceRole
    .from('cards')
    .select('id, status, access_status, player_id, order_id, orders ( purchaser_email, payment_status )')
    .eq('id', cardId)
    .maybeSingle<{
      id: string;
      status: string;
      access_status: string | null;
      player_id: string | null;
      order_id: string | null;
      orders: { purchaser_email: string; payment_status: string } | null;
    }>();

  if (
    !card ||
    !card.player_id ||
    card.status === 'claimed' ||
    card.access_status ||
    !card.orders ||
    card.orders.payment_status !== 'fulfilled' ||
    card.orders.purchaser_email !== user.email
  ) {
    return NextResponse.json({ error: 'This card is not available to recover' }, { status: 400 });
  }

  // Before any write, for both decisions (run after the authorization checks
  // in each branch): a gift order's profile belongs to the guardian who
  // approved it. The buyer can neither claim it nor pick someone else to
  // send it to.
  const giftRefusal = async (): Promise<NextResponse | null> => {
    const giftCheck = await checkGiftFirstGuardianClaim(serviceRole, card.player_id as string, user);
    if (giftCheck.outcome === 'failed') {
      return NextResponse.json({ error: 'Could not recover this card. Please try again.' }, { status: 500 });
    }
    if (giftCheck.outcome === 'refused') {
      return NextResponse.json({ error: GIFT_PROFILE_REFUSED_MESSAGE }, { status: 403 });
    }
    return null;
  };

  // Both outcomes converge on the exact same shared operations the
  // primary card-code path uses — a verified purchaser email is just a
  // different way of identifying the same claimable card, not a separate
  // ownership system.
  if (decision === 'self') {
    // Before any write. Stored order data can't tell a family card set from a
    // squad order, or which children are the purchaser's own, so only a
    // one-card order (counted from the database, never from the request) can
    // be recovered by the purchaser themselves. A card set fails closed.
    const { count, error: countError } = await serviceRole
      .from('cards')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', card.order_id ?? '');
    if (countError) {
      logRouteFailure('recover: order card count', countError);
      return NextResponse.json({ error: RECOVER_FAILED }, { status: 500 });
    }
    if (!card.order_id || count !== 1) {
      return NextResponse.json({ error: CARD_SET_NEEDS_VERIFICATION }, { status: 409 });
    }
    // A current or former coach of this child must not link their own coach
    // account as the child's guardian (same rule as a card-code claim).
    const eligibility = await checkFirstGuardianClaim(serviceRole, card.player_id, user.id);
    if (eligibility.outcome === 'failed') {
      logRouteFailure('recover: claim eligibility', eligibility.error as DbError);
      return NextResponse.json({ error: RECOVER_FAILED }, { status: 500 });
    }
    if (eligibility.outcome === 'refused') {
      return NextResponse.json({ error: 'This card is not available to recover' }, { status: 400 });
    }
    const selfGiftRefusal = await giftRefusal();
    if (selfGiftRefusal) return selfGiftRefusal;

    const result = await claimPlayerForCard(serviceRole, card, user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    // 'parent' only when the profile has no role yet.
    await ensureProfileRole(serviceRole, user.id, 'parent');
    return NextResponse.json({ ok: true, playerId: result.playerId });
  }

  if (!handoffEmail?.trim()) {
    return NextResponse.json({ error: 'handoffEmail is required to send to the right parent' }, { status: 400 });
  }
  const handoffGiftRefusal = await giftRefusal();
  if (handoffGiftRefusal) return handoffGiftRefusal;

  // The card's own order is the handoff's provenance: redemption treats it as
  // trusted order authority only for a fulfilled single-card order whose card
  // is this child's (a squad order never grants guardian authority). The
  // purchaser's email on its own grants nothing.
  const inviteResult = await createGuardianInvite(serviceRole, card.player_id, user.id, handoffEmail.trim(), 'second_guardian', card.order_id ?? undefined);
  if (!inviteResult.ok) {
    return NextResponse.json({ error: inviteResult.error }, { status: inviteResult.status });
  }

  // The purchaser never receives the code: the email is how it reaches the
  // other parent. A retry reuses the same invite and tries the email again.
  return NextResponse.json({ ok: true, emailStatus: inviteResult.emailStatus });
}
