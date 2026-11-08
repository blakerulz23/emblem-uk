import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gift (non-guardian) builder orders — who controls the child's profile.
 *
 * A builder order placed by a coach, club organiser or other adult
 * (authority_status guardian_approval_pending / guardian_approved /
 * guardian_declined, migration 0071) involves three different people:
 *
 *   - the buyer: the adult who made the card and pays for it
 *     (builder_order_authority_declarations.adult_email, orders.purchaser_email).
 *     They keep payment and delivery comms (Shopify confirmation, order
 *     status, the approval/decline notice).
 *   - the approving guardian: the address the buyer named, who opened the
 *     emailed link and approved (builder_guardian_approval_requests row with
 *     status 'approved').
 *   - the profile owner: whoever becomes the child's first guardian
 *     (a `guardians` row) through an order-approval invite, a card claim
 *     code, or purchaser recovery.
 *
 * For a guardian_approved order the profile owner must be the approving
 * guardian. Being the buyer, or holding the physical card (which is
 * delivered to the buyer), is never enough. Pending and declined orders
 * never hand profile control to anyone.
 *
 * Confirmed (parent/guardian placed it themselves), historical (NULL) and
 * Squad Invite orders are not gift orders and keep today's behaviour
 * exactly. So does a multi-card gift order: one approval cannot vouch for
 * several children, and the staff approval route already gives those a
 * team (Coach OS) invite rather than a guardian invite — see REPORT.md for
 * the open decision on them.
 */

export const GIFT_AUTHORITY_STATUSES = ['guardian_approval_pending', 'guardian_approved', 'guardian_declined'] as const;

export function isGiftAuthorityStatus(status: string | null | undefined): boolean {
  return (GIFT_AUTHORITY_STATUSES as readonly string[]).includes(status ?? '');
}

export function normaliseEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** One refusal message for every gift-order profile path, so none reveals more than the others. */
export const GIFT_PROFILE_REFUSED_MESSAGE =
  "This player's profile can only be set up by the parent or guardian who approved the card. We've emailed them an invite.";

type ApprovedGuardianLookup = { ok: true; email: string | null } | { ok: false };

/**
 * The address that approved this order, from the approval request itself
 * (status 'approved'), never from anything the buyer can edit afterwards.
 */
export async function loadApprovedGuardianEmail(service: SupabaseClient, orderId: string, purchaserEmail: string | null): Promise<ApprovedGuardianLookup> {
  const { data, error } = await service
    .from('builder_guardian_approval_requests')
    .select('guardian_email, responded_at')
    .eq('order_id', orderId)
    .eq('status', 'approved')
    .order('responded_at', { ascending: false })
    .limit(1);
  if (error) return { ok: false };
  const row = (Array.isArray(data) ? data[0] : data) as { guardian_email?: string } | undefined;
  const email = normaliseEmail(row?.guardian_email);
  if (!email) return { ok: true, email: null };

  // An approval given from the buyer's own address is not a guardian's
  // approval. The guardian-email route now refuses the buyer's own verified
  // email, but an order approved before that check existed may still carry
  // one. Treat it as having no approving guardian: the profile invite is
  // withheld and no first-guardian claim is allowed, so staff must obtain a
  // genuine guardian approval first.
  if (normaliseEmail(purchaserEmail) === email) return { ok: true, email: null };
  const buyers = await loadDeclaredBuyerEmails(service, orderId);
  if (!buyers.ok) return { ok: false };
  if (buyers.emails.includes(email)) return { ok: true, email: null };
  return { ok: true, email };
}

/** Every authority declaration's verified adult (buyer) email for an order. */
async function loadDeclaredBuyerEmails(service: SupabaseClient, orderId: string): Promise<{ ok: true; emails: string[] } | { ok: false }> {
  const { data, error } = await service.from('builder_order_authority_declarations').select('adult_email').eq('order_id', orderId);
  if (error) return { ok: false };
  return { ok: true, emails: ((data ?? []) as Array<{ adult_email?: string | null }>).map((r) => normaliseEmail(r.adult_email)).filter(Boolean) };
}

export type ProfileInviteOrder = {
  id: string;
  authority_status: string | null;
  purchaser_email: string | null;
  intended_guardian_email: string | null;
};

export type ProfileInviteRecipient =
  | { ok: true; email: string; source: 'approved_guardian' | 'intended_guardian' | 'purchaser' }
  | { ok: false; reason: 'guardian_not_approved' | 'approved_guardian_missing' | 'no_recipient' | 'lookup_failed' };

/**
 * Pure choice of who receives a single-card order's profile (guardian)
 * invite. Non-gift orders: unchanged (intended guardian, else purchaser).
 * Gift orders: only the approving guardian, and only once approved — the
 * buyer is never a fallback.
 */
export function chooseProfileInviteRecipient(
  order: Pick<ProfileInviteOrder, 'authority_status' | 'purchaser_email' | 'intended_guardian_email'>,
  approvedGuardianEmail: string | null
): ProfileInviteRecipient {
  if (isGiftAuthorityStatus(order.authority_status)) {
    if (order.authority_status !== 'guardian_approved') return { ok: false, reason: 'guardian_not_approved' };
    const email = normaliseEmail(approvedGuardianEmail);
    return email ? { ok: true, email, source: 'approved_guardian' } : { ok: false, reason: 'approved_guardian_missing' };
  }
  const intended = order.intended_guardian_email?.trim();
  if (intended) return { ok: true, email: intended, source: 'intended_guardian' };
  const purchaser = order.purchaser_email?.trim();
  if (purchaser) return { ok: true, email: purchaser, source: 'purchaser' };
  return { ok: false, reason: 'no_recipient' };
}

export async function resolveProfileInviteRecipient(service: SupabaseClient, order: ProfileInviteOrder): Promise<ProfileInviteRecipient> {
  if (order.authority_status !== 'guardian_approved') return chooseProfileInviteRecipient(order, null);
  const lookup = await loadApprovedGuardianEmail(service, order.id, order.purchaser_email);
  if (!lookup.ok) return { ok: false, reason: 'lookup_failed' };
  return chooseProfileInviteRecipient(order, lookup.email);
}

/**
 * Expires every unused order-approval invite for this order that was sent
 * to anyone other than `keepEmail` (the approving guardian). Used when staff
 * resend a gift order's invite, so an invite an earlier version of the app
 * sent to the buyer stops working. Unused invites only; a redeemed invite is
 * history and is left alone (see REPORT.md for those).
 */
export async function retireOtherOrderApprovalInvites(
  service: SupabaseClient,
  orderId: string,
  keepEmail: string
): Promise<{ ok: boolean }> {
  const { data, error } = await service
    .from('player_invites')
    .select('id, invited_email')
    .eq('order_id', orderId)
    .eq('origin', 'order_approval')
    .is('used_at', null);
  if (error) return { ok: false };
  const keep = normaliseEmail(keepEmail);
  const stale = ((data ?? []) as Array<{ id: string; invited_email: string | null }>)
    .filter((row) => normaliseEmail(row.invited_email) !== keep)
    .map((row) => row.id);
  if (stale.length === 0) return { ok: true };
  const { error: updateError } = await service.from('player_invites').update({ expires_at: new Date().toISOString() }).in('id', stale);
  return { ok: !updateError };
}

export type GiftFirstGuardianCheck =
  | { outcome: 'not_gift' }
  | { outcome: 'allowed' }
  | { outcome: 'refused' }
  | { outcome: 'failed' };

type Redeemer = { email?: string | null; email_confirmed_at?: string | null };

/**
 * Whether `redeemer` may become `playerId`'s FIRST guardian, when the child's
 * card came from a single-card gift order. Call before any write, on every
 * path that can create a first guardian link (card claim code, purchaser
 * recovery, guardian invite redemption).
 *
 * - 'not_gift': the child has no gift order, the gift order covers several
 *   children, or the child already has a guardian (adding another guardian
 *   is the existing guardian's decision, governed by the normal invite
 *   rules). The caller carries on exactly as before.
 * - 'allowed': a guardian_approved order and the redeemer's confirmed
 *   account email is the approving guardian's address.
 * - 'refused': anything else — pending or declined orders, the buyer, an
 *   unconfirmed email, a different address, a missing approval row.
 * - 'failed': a read failed; callers fail closed.
 *
 * Every card for the child is considered, not just the one presented: a
 * replacement card (migration 0075) has no order_id of its own.
 */
export async function checkGiftFirstGuardianClaim(
  service: SupabaseClient,
  playerId: string,
  redeemer: Redeemer
): Promise<GiftFirstGuardianCheck> {
  const { data: playerCards, error: cardsError } = await service.from('cards').select('order_id').eq('player_id', playerId);
  if (cardsError) return { outcome: 'failed' };
  const orderIds = Array.from(
    new Set(((playerCards ?? []) as Array<{ order_id: string | null }>).map((c) => c.order_id).filter((id): id is string => !!id))
  );
  if (orderIds.length === 0) return { outcome: 'not_gift' };

  const { data: orders, error: ordersError } = await service.from('orders').select('id, authority_status, purchaser_email').in('id', orderIds);
  if (ordersError) return { outcome: 'failed' };
  const giftOrders = ((orders ?? []) as Array<{ id: string; authority_status: string | null; purchaser_email?: string | null }>).filter((o) =>
    isGiftAuthorityStatus(o.authority_status)
  );
  if (giftOrders.length === 0) return { outcome: 'not_gift' };

  // Single-card rule, counted as distinct children on the order (the
  // approve/resend routes' "exactly one linked card"), so a stray second
  // card row for the same child can't turn this check off.
  const singleChildGiftOrders: typeof giftOrders = [];
  for (const order of giftOrders) {
    const { data: orderCards, error } = await service.from('cards').select('player_id').eq('order_id', order.id).not('player_id', 'is', null);
    if (error) return { outcome: 'failed' };
    const children = new Set(((orderCards ?? []) as Array<{ player_id: string }>).map((c) => c.player_id));
    if (children.size === 1 && children.has(playerId)) singleChildGiftOrders.push(order);
  }
  if (singleChildGiftOrders.length === 0) return { outcome: 'not_gift' };

  const { data: guardians, error: guardiansError } = await service.from('guardians').select('profile_id').eq('player_id', playerId).limit(1);
  if (guardiansError) return { outcome: 'failed' };
  if ((guardians ?? []).length > 0) return { outcome: 'not_gift' };

  const own = normaliseEmail(redeemer.email);
  if (!own || !redeemer.email_confirmed_at) return { outcome: 'refused' };

  for (const order of singleChildGiftOrders) {
    if (order.authority_status !== 'guardian_approved') return { outcome: 'refused' };
    const lookup = await loadApprovedGuardianEmail(service, order.id, order.purchaser_email ?? null);
    if (!lookup.ok) return { outcome: 'failed' };
    if (!lookup.email || lookup.email !== own) return { outcome: 'refused' };
  }
  return { outcome: 'allowed' };
}
