import { PrintProduct } from './print-capture';

export const SHOPIFY_SHOP = 'officialgudzzz.myshopify.com';

/** Map our internal product kinds to Shopify variant IDs. */
export const VARIANT_BY_PRODUCT: Record<PrintProduct, string> = {
  card:        '46363034714284',  // Custom Trading Card
  sticker:     '46363062108332',  // Custom Sticker
  keychain:    '46363062567084',  // Custom Keychain
  'poster-sm': '46363149303980',  // Custom Poster 11x17
  'poster-md': '46363149336748',  // Custom Poster 18x24
  'poster-lg': '46363149369516',  // Custom Poster 24x36
  puzzle:      '46375031767212',  // Custom Puzzle (default = Photo style)
};

export interface CartAttributes {
  printFileUrl?: string;
  playerName?: string;
  teamName?: string;
  template?: string;
  posterSize?: string;
  orderRef?: string;
  /** Single code (legacy) — prefer discountCodes. */
  discountCode?: string;
  /** Up to a few codes, joined with commas in the cart permalink. */
  discountCodes?: string[];
}

/** Build a Shopify cart permalink that adds the given variant to cart with line item attributes. */
export function buildCartUrl(product: PrintProduct, attrs: CartAttributes = {}, quantity = 1): string {
  const variantId = VARIANT_BY_PRODUCT[product];
  const params = new URLSearchParams();
  if (attrs.printFileUrl) params.set('attributes[Print File]', attrs.printFileUrl);
  if (attrs.playerName) params.set('attributes[Player Name]', attrs.playerName);
  if (attrs.teamName) params.set('attributes[Team Name]', attrs.teamName);
  if (attrs.template) params.set('attributes[Template]', attrs.template);
  if (attrs.posterSize) params.set('attributes[Poster Size]', attrs.posterSize);
  if (attrs.orderRef) params.set('attributes[Order Ref]', attrs.orderRef);
  // Collect all codes from either field, dedupe, cap.
  const codes = [
    ...(attrs.discountCodes ?? []),
    ...(attrs.discountCode ? [attrs.discountCode] : []),
  ]
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z0-9_-]{2,32}$/.test(c));
  const dedup = Array.from(new Set(codes)).slice(0, 5);
  if (dedup.length > 0) {
    params.set('discount', dedup.join(','));
    params.set('attributes[Referral Code]', dedup.join(','));
  }

  const qs = params.toString();
  return 'https://' + SHOPIFY_SHOP + '/cart/' + variantId + ':' + quantity + (qs ? '?' + qs : '');
}

/** Puzzle has 2 style variants â pick the right one. */
export const PUZZLE_VARIANT_BY_STYLE: Record<'photo' | 'card', string> = {
  photo: '46375031767212',
  card:  '46375031799980',
};

/** AI-restyled products (Meshy 3D + Gemini). One variant each, set price in Shopify admin. */
export const AI_VARIANT_BY_PRODUCT: Record<'armymen' | 'pendants' | 'rushmore', string> = {
  armymen:  '46376071397548',  // Custom Army Man
  pendants: '46376072970412',  // Custom Pendant (cameo)
  rushmore: '46376075034796',  // Custom Mount Rushmore
};

/**
 * Cart permalink for the UK single/team card checkout (Checkout Rebuild
 * Decision A — permalink over Storefront API). `Order Ref` rides along as
 * a cart attribute; Shopify carries it into the order's note_attributes,
 * which is how /api/webhooks/shopify/orders-paid finds the matching
 * `orders` row and flips it to 'paid'.
 *
 * Returns null when NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT is unset so the
 * builder can fall back to the manual "we'll email a payment link" flow
 * instead of breaking — the env var is a launch switch, not a hard dep.
 */
export function buildUkCardCartUrl(quantity: number, orderRef: string): string | null {
  const variantId = process.env.NEXT_PUBLIC_SHOPIFY_UK_CARD_VARIANT;
  if (!variantId) return null;
  const params = new URLSearchParams();
  params.set('attributes[Order Ref]', orderRef);
  return 'https://' + SHOPIFY_SHOP + '/cart/' + variantId + ':' + Math.max(1, quantity) + '?' + params.toString();
}
