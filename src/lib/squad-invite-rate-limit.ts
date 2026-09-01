import { createHmac } from 'crypto';
import { createServiceRoleClient } from './supabase/server';

export async function consumeSquadInviteRateLimit(
  headersLike: { get(name: string): string | null },
  action: 'resolve' | 'participate' | 'otp-request' | 'otp-verify' | 'link-replace' | 'concern-flag' | 'coach-card-submit' | 'campaign-close' | 'campaign-reopen' | 'payment-preview-resolve',
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
    // Replacing the link immediately kills the old one — deliberately the
    // tightest budget of any action here, tighter than OTP request/verify.
    'link-replace': { ip: 5, subject: 3 },
    // A safety-reporting action, not a growth/auth path — generous enough
    // that a genuinely concerned organiser is never blocked, tight enough
    // to stop the field being used to spam free text into the audit log.
    'concern-flag': { ip: 10, subject: 10 },
    // Generous enough for an organiser to fix a typo or swap the photo a
    // few times before staff lock it, tight enough to stop the upload path
    // being used to spam S3 writes.
    'coach-card-submit': { ip: 10, subject: 6 },
    // Real, meaningful state changes (0066) but not security-sensitive the
    // way link-replace is — generous enough for a coach genuinely toggling
    // close/reopen a couple of times, tight enough to stop either being
    // used to spam the audit trail.
    'campaign-close': { ip: 10, subject: 6 },
    'campaign-reopen': { ip: 10, subject: 6 },
    // A parent may legitimately reload the payment preview page a few
    // times within its 72-hour window — generous like 'resolve', still
    // bounded against token-guessing.
    'payment-preview-resolve': { ip: 30, subject: 30 },
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
