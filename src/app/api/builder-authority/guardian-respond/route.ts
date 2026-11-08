import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hashGuardianApprovalToken, isValidGuardianApprovalToken } from '@/lib/builder-authority';
import { sendBuilderGuardianDecisionEmail } from '@/lib/send-builder-guardian-decision-email';
import { appBaseUrl } from '@/lib/marketing/site';
import type { createServiceRoleClient as CreateServiceRoleClient } from '@/lib/supabase/server';

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

  const recordedDecision = (data as { decision?: string }).decision;
  if (recordedDecision === 'approved' || recordedDecision === 'declined') {
    await notifyBuyerOfDecision(serviceRole, tokenHash, recordedDecision);
  }

  return NextResponse.json(
    { ok: true, decision: recordedDecision },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Tells the buyer the guardian has responded (approved: with the pay link;
 * declined: no reason, nothing charged). Runs only after the RPC has
 * recorded a genuine first response, so it sends once per request. Never
 * fails or changes the guardian's response: the decision is already
 * committed, and a missing email is a much smaller problem.
 *
 * Addressed to the buyer's verified declaration email (the account that
 * must sign in to pay, see begin_gate3_checkout), falling back to the
 * order's purchaser email only when no declaration is linked.
 */
async function notifyBuyerOfDecision(
  serviceRole: ReturnType<typeof CreateServiceRoleClient>,
  tokenHash: string,
  decision: 'approved' | 'declined'
) {
  try {
    const { data: request } = await serviceRole
      .from('builder_guardian_approval_requests')
      .select('order_id')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    const orderId = (request as { order_id?: string } | null)?.order_id;
    if (!orderId) return;

    const { data: declaration } = await serviceRole
      .from('builder_order_authority_declarations')
      .select('adult_email')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let toEmail = (declaration as { adult_email?: string } | null)?.adult_email?.trim();
    if (!toEmail) {
      const { data: order } = await serviceRole.from('orders').select('purchaser_email').eq('id', orderId).maybeSingle();
      toEmail = (order as { purchaser_email?: string } | null)?.purchaser_email?.trim();
    }
    if (!toEmail) return;

    const result = await sendBuilderGuardianDecisionEmail({ toEmail, decision, payUrl: `${appBaseUrl()}/builder?pay=1` });
    if (!result.ok) console.warn('builder-authority/guardian-respond: buyer notification not sent');
  } catch {
    console.warn('builder-authority/guardian-respond: buyer notification failed');
  }
}
