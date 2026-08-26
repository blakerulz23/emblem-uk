import { createHmac } from 'crypto';
import { createServiceRoleClient } from './supabase/server';

/**
 * Shared, generic rate limiter for every anonymous, pre-order-or-auth
 * endpoint in the builder/print pipeline (Gate 1 residual/closure passes)
 * — one coherent model instead of a bespoke limiter per route. Reuses the
 * existing `consume_squad_invite_rate_limit` RPC/bucket table (migration
 * 0051) exactly as squad-invite-rate-limit.ts already does: the RPC is
 * fully generic (the "action" is baked into the caller's own HMAC bucket
 * hash, never read by the RPC itself), so extending it here for
 * unrelated builder/print actions is safe reuse of one mechanism, not a
 * schema mismatch — and it avoids a new migration purely for rate-limit
 * bookkeeping. Squad Invite's own actions keep using
 * squad-invite-rate-limit.ts directly; this module is deliberately not
 * merged with it so that file's action union stays scoped to that
 * feature.
 *
 * Capability ISSUANCE (`builder-submission-issue`) additionally uses
 * `consume_windowed_rate_limit` (migration 0069) for its rolling-window
 * and daily-ceiling tiers — the original RPC's window is hardcoded to a
 * fixed 5 minutes, which is fine as a burst cap but can't express "20 per
 * hour" or "60 per day" no matter what bucket hash is supplied.
 *
 * Request-source limiting is always an opaque HMAC digest of the
 * caller's IP, never the raw address — nothing here ever persists a raw
 * IP anywhere.
 */
export type AnonymousRequestAction =
  | 'builder-submission-issue'
  | 'render-print'
  | 'order-asset-upload'
  // Ordinary-builder Adult Permission step (migration 0071) — same
  // "anonymous, pre-order-or-auth, builder pipeline" description this
  // module's own header comment already covers, added here rather than
  // to squad-invite-rate-limit.ts for the same reason builder-submission-
  // issue etc. already live here and not there.
  | 'builder-authority-otp-request'
  | 'builder-authority-otp-verify'
  | 'builder-authority-declare'
  | 'builder-guardian-email-set'
  | 'builder-guardian-respond'
  // Gate 3 — direct Shopify checkout. Authenticated actions (the caller
  // already holds the adult's session from Adult Permission), same
  // IP+subject shape as builder-authority-declare above.
  | 'gate3-checkout-create'
  | 'gate3-payment-status';

const LIMITS: Record<
  | 'render-print'
  | 'order-asset-upload'
  | 'builder-authority-otp-request'
  | 'builder-authority-otp-verify'
  | 'builder-authority-declare'
  | 'builder-guardian-email-set'
  | 'builder-guardian-respond'
  | 'gate3-checkout-create'
  | 'gate3-payment-status',
  { ip: number; subject?: number }
> = {
  'render-print': { ip: 30, subject: 20 },
  // Generous enough for the largest real order this app already supports
  // (order-enquiry-validation.ts's own MAX_PLAYERS=200, up to two asset
  // categories each) spread across a realistic builder session, tight
  // enough that one capability can't be used to spam S3 writes.
  'order-asset-upload': { ip: 60, subject: 50 },
  // Same shape as Squad Invite's own otp-request/otp-verify budgets
  // (squad-invite-rate-limit.ts) — deliberately not reused directly, see
  // this file's own header comment on why this module stays separate.
  'builder-authority-otp-request': { ip: 5, subject: 3 },
  'builder-authority-otp-verify': { ip: 10, subject: 5 },
  // One real declaration per session in the ordinary case; generous
  // enough for a genuine correction (picked the wrong relationship, wants
  // to redo it) without being an obvious spam vector.
  'builder-authority-declare': { ip: 10, subject: 6 },
  'builder-guardian-email-set': { ip: 10, subject: 6 },
  // A guardian's own click from an emailed link — IP-keyed only in
  // practice (no reliable "subject" exists at this point beyond the order
  // id, which is not a value worth bucketing on), generous enough that a
  // guardian mis-clicking or retrying isn't blocked.
  'builder-guardian-respond': { ip: 20 },
  // One real checkout per order in the ordinary case; generous enough for
  // a guardian retrying after a lost response or reopening the review page.
  'gate3-checkout-create': { ip: 20, subject: 10 },
  // Polled while waiting for webhook confirmation — generous enough for
  // normal poll cadence, still bounded.
  'gate3-payment-status': { ip: 60, subject: 40 },
};

/**
 * Issuance has no subject yet (nothing exists before this call succeeds),
 * so it's necessarily IP-only — but an IP-only single-window limiter lets
 * an attacker simply wait out each 5-minute window indefinitely at a
 * steady rate and mint unlimited capabilities over time. Three IP-keyed
 * tiers close that: a tight burst cap (reuses the existing 5-minute RPC),
 * a rolling-hour cap, and a per-IP daily ceiling as the outer bound —
 * generous enough that a real customer retrying a lost response, or
 * abandoning one order to start another, is never blocked.
 */
const BUILDER_SUBMISSION_ISSUANCE_LIMITS = {
  burstPer5Min: 5,
  rollingPerHour: 20,
  dailyCeiling: 60,
};

async function consumeBuilderSubmissionIssuanceLimit(
  service: ReturnType<typeof createServiceRoleClient>,
  secret: string,
  identifier: string,
): Promise<boolean> {
  const bucket = (tier: string) =>
    createHmac('sha256', secret).update(`builder-submission-issue:ip:${tier}:${identifier}`).digest('hex');

  const burst = await service.rpc('consume_squad_invite_rate_limit', {
    p_bucket_hash: bucket('burst'),
    p_limit: BUILDER_SUBMISSION_ISSUANCE_LIMITS.burstPer5Min,
  });
  if (burst.error || burst.data !== true) return false;

  const rolling = await service.rpc('consume_windowed_rate_limit', {
    p_bucket_hash: bucket('rolling'),
    p_limit: BUILDER_SUBMISSION_ISSUANCE_LIMITS.rollingPerHour,
    p_window_minutes: 60,
  });
  if (rolling.error || rolling.data !== true) return false;

  const daily = await service.rpc('consume_windowed_rate_limit', {
    p_bucket_hash: bucket('daily'),
    p_limit: BUILDER_SUBMISSION_ISSUANCE_LIMITS.dailyCeiling,
    p_window_minutes: 1440,
  });
  if (daily.error || daily.data !== true) return false;

  return true;
}

export async function consumeAnonymousRequestRateLimit(
  headersLike: { get(name: string): string | null },
  action: AnonymousRequestAction,
  subject?: string,
): Promise<boolean> {
  const secret = process.env.SQUAD_INVITE_RATE_LIMIT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) return false;
    return process.env.SQUAD_INVITE_ALLOW_INSECURE_LOCAL_RATE_LIMIT === 'true';
  }
  // Same trusted-proxy assumption as squad-invite-rate-limit.ts: the
  // platform (Vercel) sets x-forwarded-for itself and strips/overwrites
  // any client-supplied value, so this is not client-spoofable.
  const forwarded = headersLike.get('x-forwarded-for')?.split(',')[0]?.trim();
  const identifier = forwarded || headersLike.get('x-real-ip') || 'unknown';
  const service = createServiceRoleClient();

  if (action === 'builder-submission-issue') {
    return consumeBuilderSubmissionIssuanceLimit(service, secret, identifier);
  }

  const limits = LIMITS[action];
  const opaqueBucket = (scope: 'ip' | 'subject', value: string) =>
    createHmac('sha256', secret).update(`${action}:${scope}:${value}`).digest('hex');
  const buckets = [{ hash: opaqueBucket('ip', identifier), limit: limits.ip }];
  if (subject && limits.subject) buckets.push({ hash: opaqueBucket('subject', subject.trim().toLowerCase()), limit: limits.subject });
  for (const bucket of buckets) {
    const { data, error } = await service.rpc('consume_squad_invite_rate_limit', {
      p_bucket_hash: bucket.hash,
      p_limit: bucket.limit,
    });
    if (error || data !== true) return false;
  }
  return true;
}
