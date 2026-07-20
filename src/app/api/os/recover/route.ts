import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { claimPlayerForCard } from '@/lib/claim-player';
import { createGuardianInvite } from '@/lib/create-guardian-invite';

export const runtime = 'nodejs';

type RecoverCardRow = {
  id: string;
  status: 'unassigned' | 'assigned' | 'claimed';
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!orders?.length) {
    return NextResponse.json({ orders: [] });
  }

  const serviceRole = createServiceRoleClient();
  const { data: cards } = await serviceRole
    .from('cards')
    .select('id, status, player_id, order_id, players ( name )')
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
  const eligible = await Promise.all(
    orders.map(async (order) => {
      const orderCards = cardsByOrder.get(order.id) ?? [];
      const openCards = await Promise.all(
        orderCards
          .filter((c) => c.status !== 'claimed')
          .map(async (c) => {
            const { count } = await serviceRole
              .from('player_invites')
              .select('id', { count: 'exact', head: true })
              .eq('player_id', c.player_id ?? '')
              .is('used_at', null)
              .gt('expires_at', new Date().toISOString());
            return (count ?? 0) > 0 ? null : c;
          })
      );
      return {
        orderId: order.id,
        orderRef: order.order_ref,
        source: order.source,
        cards: openCards
          .filter((c): c is RecoverCardRow => c !== null)
          .map((c) => ({ cardId: c.id, playerId: c.player_id, playerName: c.players?.name ?? null })),
      };
    })
  );

  return NextResponse.json({ orders: eligible.filter((o) => o.cards.length > 0) });
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
    .select('id, status, player_id, order_id, orders ( purchaser_email, payment_status )')
    .eq('id', cardId)
    .maybeSingle<{
      id: string;
      status: string;
      player_id: string | null;
      order_id: string | null;
      orders: { purchaser_email: string; payment_status: string } | null;
    }>();

  if (
    !card ||
    !card.player_id ||
    card.status === 'claimed' ||
    !card.orders ||
    card.orders.payment_status !== 'fulfilled' ||
    card.orders.purchaser_email !== user.email
  ) {
    return NextResponse.json({ error: 'This card is not available to recover' }, { status: 400 });
  }

  // Both outcomes converge on the exact same shared operations the
  // primary card-code path uses — a verified purchaser email is just a
  // different way of identifying the same claimable card, not a separate
  // ownership system.
  if (decision === 'self') {
    const result = await claimPlayerForCard(serviceRole, card, user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await supabase.from('profiles').upsert({ id: user.id, role: 'parent' });
    return NextResponse.json({ ok: true, playerId: result.playerId });
  }

  if (!handoffEmail?.trim()) {
    return NextResponse.json({ error: 'handoffEmail is required to send to the right parent' }, { status: 400 });
  }

  const inviteResult = await createGuardianInvite(serviceRole, card.player_id, user.id, handoffEmail.trim());
  if (!inviteResult.ok) {
    return NextResponse.json({ error: inviteResult.error }, { status: inviteResult.status });
  }

  return NextResponse.json({ ok: true });
}
