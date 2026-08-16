import { createHmac } from 'crypto';
import { createServiceRoleClient } from './supabase/server';

export async function consumeSquadInviteRateLimit(
  headersLike: { get(name: string): string | null },
  action: 'resolve' | 'participate' | 'otp-request' | 'otp-verify' | 'concern-flag',
  subject?: string,
): Promise<boolean> {
  const secret = process.env.SQUAD_INVITE_RATE_LIMIT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) return false;
    return process.env.SQUAD_INVITE_ALLOW_INSECURE_LOCAL_RATE_LIMIT === 'true';
  }
  const forwarded = headersLike.get('x-forwarded-for')?.split(',')[0]?.trim();
  const identifier = forwarded || headersLike.get('x-real-ip') || 'unknown';
  const limits = {
    resolve: { ip: 60, subject: 60 }, participate: { ip: 12, subject: 12 },
    'otp-request': { ip: 5, subject: 3 }, 'otp-verify': { ip: 10, subject: 5 },
    // A safety-reporting action, not a growth/auth path — generous enough
    // that a genuinely concerned organiser is never blocked, tight enough
    // to stop the field being used to spam free text into the audit log.
    'concern-flag': { ip: 10, subject: 10 },
  }[action];
  const opaqueBucket = (scope: 'ip' | 'subject', value: string) =>
    createHmac('sha256', secret).update(`${action}:${scope}:${value}`).digest('hex');
  const buckets = [{ hash: opaqueBucket('ip', identifier), limit: limits.ip }];
  if (subject) buckets.push({ hash: opaqueBucket('subject', subject.trim().toLowerCase()), limit: limits.subject });
  const service = createServiceRoleClient();
  for (const bucket of buckets) {
    const { data, error } = await service.rpc('consume_squad_invite_rate_limit', {
      p_bucket_hash: bucket.hash, p_limit: bucket.limit,
    });
    if (error || data !== true) return false;
  }
  return true;
}
