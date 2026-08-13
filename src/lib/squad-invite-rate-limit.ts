import { createHmac } from 'crypto';
import { createServiceRoleClient } from './supabase/server';

export async function consumeSquadInviteRateLimit(
  headersLike: { get(name: string): string | null },
  action: 'resolve' | 'participate',
): Promise<boolean> {
  const secret = process.env.SQUAD_INVITE_RATE_LIMIT_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const forwarded = headersLike.get('x-forwarded-for')?.split(',')[0]?.trim();
  const identifier = forwarded || headersLike.get('x-real-ip') || 'unknown';
  const bucketHash = createHmac('sha256', secret).update(`${action}:${identifier}`).digest('hex');
  const limit = action === 'resolve' ? 60 : 12;
  const { data, error } = await createServiceRoleClient().rpc('consume_squad_invite_rate_limit', {
    p_bucket_hash: bucketHash, p_limit: limit,
  });
  return !error && data === true;
}
