import { randomBytes, createHash, timingSafeEqual } from 'crypto';

export {
  BUILDER_AUTHORITY_DECLARATION_VERSION,
  BUILDER_AUTHORITY_CONFIRMATIONS,
  type BuilderAuthorityRelationship,
} from './builder-authority-shared';

/**
 * High-entropy guardian-approval token — same construction as
 * generatePublicPlayerId (claim-code.ts): 192 bits from crypto.randomBytes,
 * base64url so it's URL-safe with no padding. Longer than
 * generatePublicPlayerId's 128 bits since this token authorises a
 * one-time, high-consequence action (approve/decline production of a
 * child's card) rather than a long-lived public identifier.
 */
export function generateGuardianApprovalToken(): string {
  return randomBytes(24).toString('base64url');
}

/** SHA-256 hex hash — the only form of a guardian-approval token ever sent to Postgres. Never digest() in SQL; see migration 0071's own comments for why. */
export function hashGuardianApprovalToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function isValidGuardianApprovalToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** Constant-time comparison, used only for the local shape/self-check in tests — the real authorisation check is always the database hash lookup, not a comparison this module performs. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
