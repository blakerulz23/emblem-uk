import type { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Unpaid direct-order recovery.
 *
 * A direct builder order is created before payment, and its id lives only
 * in the builder tab (it is deliberately never saved on the device). A
 * parent who closes the tab or leaves Shopify before paying had no way back
 * to that order. This lists the verified adult's own unpaid orders so they
 * can resume checkout through the EXISTING /api/orders/[id]/checkout route,
 * which re-checks ownership, authority and payment state in SQL
 * (begin_gate3_checkout) and builds the cart from the stored price. Nothing
 * here creates, changes or prices an order.
 *
 * Ownership is the same anchor checkout uses: the order's Adult Permission
 * declaration was made by this Supabase user (adult_user_id). A fresh email
 * code is required (FRESH_SIGN_IN_MS) so an old session left on a shared
 * device is never enough to see a family's orders.
 */
export const FRESH_SIGN_IN_MS = 30 * 60 * 1000;
export const RECOVERY_WINDOW_DAYS = 30;
const MAX_ORDERS = 10;

export function isFreshSignIn(lastSignInAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSignInAt) return false;
  const at = Date.parse(lastSignInAt);
  return Number.isFinite(at) && now - at >= -60_000 && now - at <= FRESH_SIGN_IN_MS;
}

export type RecoverableOrder = {
  orderId: string;
  orderRef: string;
  createdAt: string;
  cardCount: number;
  totalPence: number;
  currency: string;
  /** First names only: enough for the parent to recognise their own order. */
  playerFirstNames: string[];
  /** A checkout was already opened once — it may still be open in another tab. */
  checkoutStarted: boolean;
};

type Service = ReturnType<typeof createServiceRoleClient>;

export async function listRecoverableOrders(service: Service, userId: string, now = Date.now()): Promise<RecoverableOrder[]> {
  const { data: declarations, error: declError } = await service
    .from('builder_order_authority_declarations')
    .select('order_id')
    .eq('adult_user_id', userId)
    .not('order_id', 'is', null);
  if (declError) throw new Error(declError.message);
  const ids = Array.from(new Set((declarations ?? []).map((d) => (d as { order_id: string }).order_id).filter(Boolean)));
  if (ids.length === 0) return [];

  const cutoff = new Date(now - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error: orderError } = await service
    .from('orders')
    .select('id, order_ref, created_at, total_print_quantity, subtotal_pence, currency, payment_status')
    .in('id', ids)
    .neq('source', 'squad_invite') // Squad Invite has its own payment link
    .in('payment_status', ['order_intent', 'pending_payment']) // never paid, fulfilled, cancelled, refunded or failed
    .in('authority_status', ['confirmed', 'guardian_approved'])
    .eq('pricing_tier', 'single') // the only tier checkout supports (gate3CheckoutSupportsTier)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS);
  if (orderError) throw new Error(orderError.message);
  const rows = (orders ?? []) as Array<{
    id: string; order_ref: string; created_at: string; total_print_quantity: number | null;
    subtotal_pence: number | null; currency: string | null; payment_status: string;
  }>;
  if (rows.length === 0) return [];

  const { data: cards, error: cardError } = await service
    .from('cards')
    .select('order_id, players(name)')
    .in('order_id', rows.map((r) => r.id));
  if (cardError) throw new Error(cardError.message);
  const names = new Map<string, string[]>();
  for (const card of (cards ?? []) as Array<{ order_id: string; players: unknown }>) {
    const player = (Array.isArray(card.players) ? card.players[0] : card.players) as { name?: string } | null;
    const first = player?.name?.trim().split(/\s+/)[0];
    if (!first) continue;
    names.set(card.order_id, [...(names.get(card.order_id) ?? []), first]);
  }

  return rows
    .filter((r) => r.subtotal_pence != null && r.total_print_quantity != null)
    .map((r) => ({
      orderId: r.id,
      orderRef: r.order_ref,
      createdAt: r.created_at,
      cardCount: r.total_print_quantity as number,
      totalPence: r.subtotal_pence as number,
      currency: r.currency ?? 'GBP',
      playerFirstNames: names.get(r.id) ?? [],
      checkoutStarted: r.payment_status === 'pending_payment',
    }));
}
