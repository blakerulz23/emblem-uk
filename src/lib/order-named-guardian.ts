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

export const NAMED_GUARDIAN_RECOVERY_REFUSED_MESSAGE =
  "This card's order names the child's parent or guardian, so only they can set up the profile. Contact Emblem support if that isn't right.";
