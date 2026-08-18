import { createHash, randomBytes } from 'crypto';

export const SQUAD_INVITE_LINK_COOKIE = 'emblem_squad_invite_link';
export const SQUAD_INVITE_LINK_BYTES = 32;

export function createSquadInviteLinkToken(): { token: string; hash: string } {
  const token = randomBytes(SQUAD_INVITE_LINK_BYTES).toString('base64url');
  return { token, hash: hashSquadInviteLinkToken(token) };
}

export function hashSquadInviteLinkToken(token: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid invitation credential');
  return createHash('sha256').update(token).digest('hex');
}

export interface SafeSquadInviteProjection {
  teamName: string;
  ageGroup: string;
  deadlineAt: string;
  completedCommitments: number;
  currentIncentive: 'single' | 'multi' | 'squad';
  squadPriceUnlocked: boolean;
  freeCoachCardConfirmed: boolean;
  deliverySummary: string;
  badgeReference: unknown | null;
  productSummary: string;
}

const SAFE_KEYS = new Set<keyof SafeSquadInviteProjection>([
  'teamName','ageGroup','deadlineAt','completedCommitments','currentIncentive',
  'squadPriceUnlocked','freeCoachCardConfirmed','deliverySummary','badgeReference','productSummary',
]);

export function assertSafeSquadInviteProjection(value: Record<string, unknown>): SafeSquadInviteProjection {
  for (const key of Object.keys(value)) {
    if (!SAFE_KEYS.has(key as keyof SafeSquadInviteProjection)) throw new Error(`Unsafe invitation field: ${key}`);
  }
  return value as unknown as SafeSquadInviteProjection;
}

export const UNAVAILABLE_INVITATION = { error: 'Squad Invite unavailable' } as const;
