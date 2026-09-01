import { createHash, randomBytes } from 'crypto';

/**
 * Bearer credential for the Squad Invite "Pay now" preview page
 * (/squad-invite/pay) — structurally identical to squad-invite-link.ts's
 * own token/hash pair (same byte length, same base64url encoding, same
 * sha256 hex digest), deliberately kept as its own file rather than a
 * shared generic: different data shape, different lifecycle (issued once,
 * per-participation, alongside the 72-hour payment window — never reused
 * across campaigns the way an invitation link is), no benefit to coupling
 * two independent credential types under one name. See migration 0081.
 */
const TOKEN_BYTES = 32;

export function createSquadInvitePaymentPreviewToken(): { token: string; hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashSquadInvitePaymentPreviewToken(token) };
}

export function hashSquadInvitePaymentPreviewToken(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid payment preview credential');
  return createHash('sha256').update(token).digest('hex');
}

export const UNAVAILABLE_PAYMENT_PREVIEW = { error: 'Payment preview unavailable' } as const;

/**
 * Explicit field allowlist for what a resolved token is allowed to return
 * to the client — mirrors assertSafeSquadInviteProjection's role for the
 * sibling invitation-link flow. Belt-and-braces alongside
 * resolve_squad_invite_payment_preview's own fixed jsonb_build_object
 * shape in migration 0081: even if a future edit to that RPC accidentally
 * widened its return value, this assertion stops the extra field ever
 * leaving the API route.
 */
export interface SafePaymentPreviewCard {
  templateId: string;
  sport: string;
  name: string;
  number: string | null;
  team: string;
  position: string | null;
  logo: string | null;
  photoStorageKey: string | null;
  photoCrop: { x: number; y: number; scale: number } | null;
  stats: Record<string, string> | null;
}

export interface SafePaymentPreviewProjection {
  status: 'payment_requested' | 'paid';
  teamName: string;
  tier: 'single' | 'multi' | 'squad';
  unitPricePence: number;
  printQuantity: number;
  totalPence: number;
  deadlineAt: string | null;
  orderRef: string;
  card: SafePaymentPreviewCard | null;
}

const SAFE_KEYS = new Set<keyof SafePaymentPreviewProjection>([
  'status', 'teamName', 'tier', 'unitPricePence', 'printQuantity',
  'totalPence', 'deadlineAt', 'orderRef', 'card',
]);

export function assertSafePaymentPreviewProjection(value: Record<string, unknown>): SafePaymentPreviewProjection {
  for (const key of Object.keys(value)) {
    if (!SAFE_KEYS.has(key as keyof SafePaymentPreviewProjection)) throw new Error(`Unsafe payment preview field: ${key}`);
  }
  return value as unknown as SafePaymentPreviewProjection;
}
