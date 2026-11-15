import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseEmail } from '@/lib/gift-order-guardian';

/**
 * Purchaser recovery (/api/os/recover) lets the buyer of a fulfilled,
 * single-card order claim the child's profile themselves, or hand it to an
 * address they choose. That is refused whenever the order names, or once
 * named, a separate parent or guardian (Blake, 14 November 2026): the
 * named person is the one who sets the profile up, whatever has happened to
 * their account since.
 *
 * - 'refused': the order names a guardian whose address isn't the
 *   purchaser's, or it recorded that its named guardian's account was erased
 *   (intended_guardian_erased_at, migration 0097) — erased addresses can't be
 *   compared any more, so that always refuses.
 * - 'allowed': no guardian was ever named, or the named address is the
 *   purchaser's own.
 * - 'failed': the order could not be read (or doesn't exist): callers fail
 *   closed.
 *
 * The order is read with select('*') so this works before and after 0097.
 */
export type NamedGuardianCheck = { outcome: 'allowed' } | { outcome: 'refused' } | { outcome: 'failed' };

type OrderRow = { id?: string; purchaser_email?: string | null; intended_guardian_email?: string | null; intended_guardian_erased_at?: string | null };

export function namedGuardianOutcome(order: OrderRow): 'allowed' | 'refused' {
  if (order.intended_guardian_erased_at) return 'refused';
  const named = normaliseEmail(order.intended_guardian_email);
  if (!named) return 'allowed';
  return named === normaliseEmail(order.purchaser_email) ? 'allowed' : 'refused';
}

export async function checkOrderNamesSeparateGuardian(service: SupabaseClient, orderId: string | null | undefined): Promise<NamedGuardianCheck> {
  if (!orderId) return { outcome: 'failed' };
  const { data, error } = await service.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) return { outcome: 'failed' };
  const row = data as OrderRow | null;
  if (!row || row.id !== orderId) return { outcome: 'failed' };
  return { outcome: namedGuardianOutcome(row) };
}

/** Same rule for a list of orders (the recovery list). Missing rows fail closed (refused). */
export async function ordersNamingSeparateGuardian(service: SupabaseClient, orderIds: string[]): Promise<{ ok: true; refused: Set<string> } | { ok: false }> {
  if (orderIds.length === 0) return { ok: true, refused: new Set() };
  const { data, error } = await service.from('orders').select('*').in('id', orderIds);
  if (error) return { ok: false };
  const rows = new Map(((data ?? []) as OrderRow[]).filter((r) => r.id).map((r) => [r.id as string, r]));
  return { ok: true, refused: new Set(orderIds.filter((oid) => !rows.has(oid) || namedGuardianOutcome(rows.get(oid) as OrderRow) === 'refused')) };
}

type Claimant = { email?: string | null; email_confirmed_at?: string | null };

/**
 * Card claim code (/api/os/claim). The physical card of an order goes to the
 * buyer, so for an order that names, or once named, a separate parent or
 * guardian (the recovery rule above, namedGuardianOutcome) the purchaser
 * must not claim the card themselves, including after that guardian's
 * account was erased (Blake, 15 November 2026).
 *
 * Every card for the child is considered, not just the one presented: a
 * replacement card (migration 0075) has no order_id of its own.
 *
 * For each such order:
 * - the named guardian (their confirmed account email is the order's named
 *   address, still recorded) may claim;
 * - the purchaser (confirmed email is the purchaser address) is refused;
 * - when identity is uncertain it is refused: no confirmed email, or the
 *   purchaser address is no longer recorded so the claimant can't be told
 *   apart from the buyer;
 * - anyone else (not the buyer) carries on exactly as before.
 * Orders that never named a separate guardian change nothing.
 *
 * 'failed': a card or order read failed, or an order the child's cards point
 * to couldn't be read: callers fail closed. The buyer using a second account
 * under a different address can't be detected here (as with the coach rule).
 */
export async function checkPurchaserCardClaim(
  service: SupabaseClient,
  playerId: string,
  claimant: Claimant,
): Promise<NamedGuardianCheck> {
  const { data: cards, error: cardsError } = await service.from('cards').select('order_id').eq('player_id', playerId);
  if (cardsError) return { outcome: 'failed' };
  const orderIds = Array.from(
    new Set(((cards ?? []) as Array<{ order_id: string | null }>).map((c) => c.order_id).filter((id): id is string => !!id)),
  );
  if (orderIds.length === 0) return { outcome: 'allowed' };

  const { data: orders, error: ordersError } = await service.from('orders').select('*').in('id', orderIds);
  if (ordersError) return { outcome: 'failed' };
  const rows = new Map(((orders ?? []) as OrderRow[]).filter((r) => r.id).map((r) => [r.id as string, r]));
  if (orderIds.some((oid) => !rows.has(oid))) return { outcome: 'failed' };

  const restricted = orderIds.map((oid) => rows.get(oid) as OrderRow).filter((o) => namedGuardianOutcome(o) === 'refused');
  if (restricted.length === 0) return { outcome: 'allowed' };

  const own = normaliseEmail(claimant.email);
  if (!own || !claimant.email_confirmed_at) return { outcome: 'refused' };
  for (const order of restricted) {
    if (!order.intended_guardian_erased_at && normaliseEmail(order.intended_guardian_email) === own) continue;
    const purchaser = normaliseEmail(order.purchaser_email);
    if (!purchaser || purchaser === own) return { outcome: 'refused' };
  }
  return { outcome: 'allowed' };
}

export const NAMED_GUARDIAN_CARD_CLAIM_REFUSED_MESSAGE =
  "This card's order names the child's parent or guardian, so only they can claim it. Contact Emblem support if that isn't right.";

export const NAMED_GUARDIAN_RECOVERY_REFUSED_MESSAGE =
  "This card's order names the child's parent or guardian, so only they can set up the profile. Contact Emblem support if that isn't right.";
