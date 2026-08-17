import { SHOPIFY_SHOP } from './shopify';

const VARIANT_ENV_BY_TIER: Record<'single' | 'multi' | 'squad', string> = {
  single: 'NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SINGLE',
  multi: 'NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_MULTI',
  squad: 'NEXT_PUBLIC_SHOPIFY_SQUAD_INVITE_VARIANT_SQUAD',
};

/**
 * Cart permalink for one Squad Invite participation's payment — the exact
 * same technique buildUkCardCartUrl already uses for the main builder
 * (Checkout Rebuild Decision A: permalink over Storefront API), which is
 * what lets this reuse /api/webhooks/shopify/orders-paid completely
 * unchanged: it already matches purely on the Order Ref cart attribute
 * against orders.order_ref, and Squad Invite orders already get a real,
 * unique order_ref at commit time (see commit_squad_invite_participation_order,
 * migration 0055).
 *
 * Quantity is the participation's own print_quantity — the copies that
 * specific parent asked for, not a fixed 1.
 *
 * Returns null when the tier's variant isn't configured (three separate
 * env vars, one per tier, since each is priced differently), so a caller
 * can skip issuing a broken link rather than crash — same fallback
 * contract buildUkCardCartUrl already uses for its own variant.
 */
export function buildSquadInvitePaymentUrl(tier: 'single' | 'multi' | 'squad', printQuantity: number, orderRef: string): string | null {
  const variantId = process.env[VARIANT_ENV_BY_TIER[tier]];
  if (!variantId) return null;
  const quantity = Math.max(1, Math.floor(printQuantity) || 1);
  const params = new URLSearchParams();
  params.set('attributes[Order Ref]', orderRef);
  return 'https://' + SHOPIFY_SHOP + '/cart/' + variantId + ':' + quantity + '?' + params.toString();
}
