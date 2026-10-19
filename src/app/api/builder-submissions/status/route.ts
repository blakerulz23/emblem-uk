import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { revokeBuilderSubmissionCapability } from '@/lib/builder-submission-capability';
import { resolveSubmissionStatus } from '@/lib/builder-submission-status';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Did an interrupted submit place an order? Asked by the builder when a
 * restored draft still carries the submission id it was sending under (see
 * builder-submission-status.ts). Answers only 'placed' / 'not_placed' /
 * 'in_progress' — never an order id, reference, price or any personal data.
 * The submission id is a random UUID held only in that device's draft.
 */
export async function POST(req: NextRequest) {
  if (!hasValidBuilderCsrf(req)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { submissionKey?: unknown } | null;
  const submissionKey = typeof body?.submissionKey === 'string' && UUID.test(body.submissionKey) ? body.submissionKey : null;
  if (!submissionKey) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!(await consumeAnonymousRequestRateLimit(req.headers, 'builder-submission-status', submissionKey))) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const service = createServiceRoleClient();
    const status = await resolveSubmissionStatus(submissionKey, {
      orderExists: async (id) => {
        const { data, error } = await service.from('orders').select('id').eq('submission_key', id).limit(1);
        if (error) throw new Error(error.message);
        return Boolean(data && data.length > 0);
      },
      capabilityState: async (id) => {
        const { data, error } = await service.from('builder_submission_capabilities').select('state').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        return (data as { state?: string } | null)?.state ?? null;
      },
      revoke: revokeBuilderSubmissionCapability,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    return NextResponse.json({ status });
  } catch (e: unknown) {
    console.error('[builder-submissions/status] failed:', e instanceof Error ? e.message : 'unknown error');
    // Unknown is never "safe to resend": the builder keeps sending paused.
    return NextResponse.json({ error: 'status unavailable' }, { status: 503 });
  }
}
