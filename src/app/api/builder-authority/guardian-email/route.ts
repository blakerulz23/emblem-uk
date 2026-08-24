import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';
import {
  BUILDER_AUTHORITY_DECLARATION_VERSION,
  generateGuardianApprovalToken,
  hashGuardianApprovalToken,
} from '@/lib/builder-authority';
import { sendBuilderGuardianApprovalEmail } from '@/lib/send-builder-guardian-approval-email';

/**
 * Guardian-pending screen: collects the real guardian email for a
 * non-guardian order (coach/club organiser/other) and, in this same
 * request, generates the raw approval token, persists only its hash via
 * create_builder_guardian_approval_request (migration 0071), and sends
 * the email while the raw token is still in memory. The raw token is
 * never returned to the client and never stored anywhere — see the
 * migration's comments for why this must happen in one request rather
 * than two.
 *
 * Note on atomicity: only the Postgres write (the RPC call below) is a
 * real transaction — it either commits the approval-request row and its
 * hashed token, or nothing does, regardless of what happens next. The
 * email send is a separate, non-transactional network call to Resend and
 * cannot be made atomic with it. This route therefore treats a failed
 * send as a failed request (see the emailResult.ok check below) rather
 * than silently reporting success: the DB row is still valid, but the
 * guardian was never actually notified, and the customer needs to know so
 * they can retry. A retry is safe — create_builder_guardian_approval_request
 * revokes any existing pending row for this order before inserting the new
 * one, so resubmitting always rotates to a fresh token and never leaves two
 * live pending tokens for the same order (the RPC also row-locks the order
 * for the duration of the call, so two concurrent submits can't race past
 * that revoke-then-insert and both end up pending at once).
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = await request.json().catch(() => null) as { orderId?: unknown; guardianEmail?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const guardianEmail = typeof body?.guardianEmail === 'string' ? body.guardianEmail.trim().toLowerCase() : '';

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  if (guardianEmail.length < 3 || guardianEmail.length > 254 || !guardianEmail.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'builder-guardian-email-set', guardianEmail))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const rawToken = generateGuardianApprovalToken();
  const tokenHash = hashGuardianApprovalToken(rawToken);

  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole.rpc('create_builder_guardian_approval_request', {
    p_order_id: orderId,
    p_guardian_email: guardianEmail,
    p_token_hash: tokenHash,
    p_declaration_version: BUILDER_AUTHORITY_DECLARATION_VERSION,
  });

  if (error) {
    console.error('builder-authority/guardian-email:rpc', error.message);
    return NextResponse.json({ error: 'We could not send that request. Please check the order and try again.' }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://emblem-uk-lauda-collectives-projects.vercel.app';
  const approveUrl = `${siteUrl}/builder-approval/${encodeURIComponent(rawToken)}`;
  const emailResult = await sendBuilderGuardianApprovalEmail({ toEmail: guardianEmail, approveUrl });
  if (!emailResult.ok) {
    // The DB row is already committed and valid (a real, unexpired pending
    // token exists) — but the guardian was never actually notified, so this
    // must not be reported to the customer as success. Telling them to
    // retry is safe: the next call revokes this row and issues a fresh
    // token (see the RPC's own revoke-then-insert behaviour), it never
    // stacks a second live pending token alongside this one.
    console.warn('builder-authority/guardian-email:send-failed — request row committed, email not delivered');
    return NextResponse.json(
      { error: 'We could not send that email — please try again.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
