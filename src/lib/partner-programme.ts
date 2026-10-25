/**
 * UK partner (creator affiliate) programme — the pure rules, shared by the
 * apply route, the orders/paid webhook, the staff tools and the partner
 * dashboard. Terms mirror the Canadian programme (emblem-ca's
 * partner-program.ts) so a creator working in both markets sees the same
 * deal: 20% off for their audience, 20% commission on what the customer
 * paid for cards, a 45-day hold, paid monthly once £40 is owed.
 *
 * How a UK order is credited (no cookie, no tracking — see
 * docs/partner-programme-uk.md):
 *  1. Staff create the creator's code in Shopify Admin as a percentage
 *     discount on the UK card variant only (same store as Canada, so codes
 *     share one namespace), then record it in /staff/partners.
 *  2. The customer types the code at Shopify checkout.
 *  3. orders/paid reads the order's discount code; if it is a UK partner
 *     code, verifyPaidLineItem accepts exactly that percentage off (and
 *     nothing else), and record_uk_partner_commission (migration 0095)
 *     writes one commission row for the order.
 *
 * Squad Invite orders never accept a partner discount: their price is set
 * by the squad tier and is verified exactly, as before.
 */

export const PARTNER_TERMS_VERSION = 'uk-2026-10';

export const DEFAULT_COMMISSION_BPS = 2000;
export const DEFAULT_CUSTOMER_DISCOUNT_BPS = 2000;
export const MAX_COMMISSION_BPS = 5000;
export const MAX_CUSTOMER_DISCOUNT_BPS = 5000;
export const COMMISSION_HOLD_DAYS = 45;
export const PAYOUT_MINIMUM_PENCE = 4000;

/** Partner codes: 3–20 upper-case letters or digits (Shopify codes are case-insensitive). */
export const PARTNER_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

export function normalizePartnerCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return PARTNER_CODE_PATTERN.test(code) ? code : null;
}

/**
 * The single discount code on a Shopify order, upper-cased — or null when
 * the order has none. More than one code (or a malformed entry) is
 * reported as 'multiple', which the webhook treats like an unknown
 * discount: never accepted, staff alerted.
 */
export function extractOrderDiscountCode(payload: unknown): { code: string | null } | 'multiple' {
  const raw = (payload as { discount_codes?: unknown } | null)?.discount_codes;
  if (!Array.isArray(raw) || raw.length === 0) return { code: null };
  if (raw.length > 1) return 'multiple';
  const code = normalizePartnerCode((raw[0] as { code?: unknown } | null)?.code);
  return code ? { code } : 'multiple';
}

/**
 * Shopify allocates a percentage discount per line, rounded to the penny,
 * so the exact pence can differ from our own calculation by rounding. One
 * penny either way per line is accepted; anything more is not this
 * percentage.
 */
export const DISCOUNT_ROUNDING_TOLERANCE_PENCE = 1;

export function expectedDiscountPence(unitPricePence: number, quantity: number, discountBps: number): number {
  return Math.round((unitPricePence * quantity * discountBps) / 10000);
}

/** Commission on what the customer paid for cards (after discount, before shipping), rounded down. */
export function commissionPence(paidSubtotalPence: number, commissionBps: number): number {
  if (!Number.isSafeInteger(paidSubtotalPence) || paidSubtotalPence <= 0) return 0;
  return Math.floor((paidSubtotalPence * commissionBps) / 10000);
}

export function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatPercentFromBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/** The caption a creator copies — "Ad" first, as the ASA guide (Oct 2026) asks. */
export function partnerCaption(code: string, discountBps: number): string {
  if (discountBps <= 0) return `Ad · Make their football card at emblem.cards with code ${code}`;
  return `Ad · ${formatPercentFromBps(discountBps)} off a personalised football card at emblem.cards with code ${code}`;
}

export type CommissionStatus = 'pending' | 'void' | 'paid';

/**
 * Whether a pending commission can go into a payout now: the hold has
 * passed and the order is still paid (or fulfilled). A refunded or
 * cancelled order never earns, whatever the commission row says.
 */
export function commissionIsPayable(
  row: { status: CommissionStatus; hold_until: string },
  orderPaymentStatus: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (row.status !== 'pending') return false;
  if (orderPaymentStatus !== 'paid' && orderPaymentStatus !== 'fulfilled') return false;
  return new Date(row.hold_until).getTime() <= now.getTime();
}

export const PARTNER_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'other'] as const;
export type PartnerPlatform = (typeof PARTNER_PLATFORMS)[number];

export type PartnerApplication = {
  name: string;
  email: string;
  platform: PartnerPlatform;
  profileUrl: string;
  audience: string;
  confirmedAdult: true;
  confirmedUk: true;
  acceptedTerms: true;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the public application form. Returns a short, user-facing
 * error for the first problem found. Free text is length-capped and kept
 * to what staff need to vet a creator — never anything about children.
 */
export function parsePartnerApplication(body: unknown): { ok: true; value: PartnerApplication } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const name = str(b.name, 100);
  if (name.length < 2) return { ok: false, error: 'Please enter your name.' };

  const email = str(b.email, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: 'Please enter a valid email address.' };

  const platform = str(b.platform, 20).toLowerCase();
  if (!(PARTNER_PLATFORMS as readonly string[]).includes(platform)) return { ok: false, error: 'Please choose your main platform.' };

  const profileUrl = str(b.profileUrl, 300);
  let parsed: URL | null = null;
  try {
    parsed = new URL(profileUrl);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:') return { ok: false, error: 'Please enter the full https:// link to your profile.' };

  const audience = str(b.audience, 1000);
  if (audience.length < 10) return { ok: false, error: 'Please tell us a little about who follows you.' };

  if (b.confirmedAdult !== true) return { ok: false, error: 'Partners must be 18 or over.' };
  if (b.confirmedUk !== true) return { ok: false, error: 'The UK programme is for UK-based creators.' };
  if (b.acceptedTerms !== true) return { ok: false, error: 'Please accept the partner terms.' };

  return {
    ok: true,
    value: { name, email, platform: platform as PartnerPlatform, profileUrl: parsed.toString(), audience, confirmedAdult: true, confirmedUk: true, acceptedTerms: true },
  };
}
