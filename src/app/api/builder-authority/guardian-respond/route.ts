import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hashGuardianApprovalToken, isValidGuardianApprovalToken } from '@/lib/builder-authority';

/**
 * The guardian's click-through from the emailed link (src/app/builder-approval/[token]/page.tsx).
 * No builder CSRF cookie applies here — the guardian has never visited
 * /builder, so there is no double-submit cookie to check. The token itself
 * (32-char high-entropy, single-use via the pending/expiry check inside
 * respond_to_builder_guardian_approval) is the only credential, exactly as
 * with every other email-link-authorised action in this codebase. Origin
 * is intentionally not restricted since guardians open email links from
 * mail clients, not the app's own origin.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { token?: unknown; decision?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const decision = typeof body?.decision === 'string' ? body.decision : '';

  if (!isValidGuardianApprovalToken(token)) {
    return NextResponse.json({ error: 'This link is no longer valid' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'declined') {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }

  const tokenHash = hashGuardianApprovalToken(token);

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'builder-guardian-respond', tokenHash))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.rpc('respond_to_builder_guardian_approval', {
    p_token_hash: tokenHash,
    p_decision: decision,
  });

  if (error) {
    console.error('builder-authority/guardian-respond:rpc', error.message);
    return NextResponse.json({ error: 'This link is no longer valid' }, { status: 400 });
  }

  // The RPC never throws for an invalid/expired/already-used token — it
  // returns { ok: false } so this route can give the same generic
  // "link no longer valid" response the product spec requires, without
  // distinguishing wrong-token from expired from already-responded.
  if (!(data as { ok?: boolean } | null)?.ok) {
    return NextResponse.json({ error: 'This link is no longer valid' }, { status: 400 });
  }

  return NextResponse.json(
    { ok: true, decision: (data as { decision?: string }).decision },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
