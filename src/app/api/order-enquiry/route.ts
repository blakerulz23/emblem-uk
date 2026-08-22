import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { headObject } from '@/lib/s3-client';
import { validateOrderEnquiry, verifySubmittedAssetKeys, type EnquiryBody } from '@/lib/order-enquiry-validation';
import { beginBuilderSubmissionFinalising, finishBuilderSubmissionFinalising } from '@/lib/builder-submission-capability';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

export const runtime = 'nodejs';

/**
 * Stage 6 — server-authoritative, idempotent, atomic order persistence.
 *
 * Replaces the previous sequential-PostgREST-calls version of this route
 * (orders insert, then a per-player loop of players/cards/card_definitions/
 * moments inserts, each independently able to fail — see the Stage 6
 * report for the exact partial-failure states that made possible) with a
 * single call to the SECURITY DEFINER function
 * public.create_authoritative_order (migration
 * 0048_authoritative_order_persistence.sql), which does every write inside
 * one Postgres transaction: it all commits, or none of it does.
 *
 * All request validation and authoritative-pricing derivation lives in
 * src/lib/order-enquiry-validation.ts (pure, unit-tested there) — this
 * route's only job is parsing the body, calling that function, verifying
 * every referenced photo actually exists in S3 (a namespace-prefix check
 * alone proves a key *claims* to belong to this submission, not that it
 * was ever really uploaded), calling the RPC with the validated result,
 * and shaping the response. It never reads body.pricing for anything
 * persisted.
 */
export async function POST(request: NextRequest) {
  // CSRF fails before body parsing, asset verification, order creation or
  // capability finalisation — Gate 1 closure pass.
  if (!hasValidBuilderCsrf(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }

  let body: EnquiryBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid production request payload' }, { status: 400 });
  }

  const validated = validateOrderEnquiry(body, {
    fingerprint: (input) => createHash('sha256').update(input).digest('hex'),
  });

  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const submissionKey = validated.params.p_submission_key;

  // Begins the finalising transition before any further work — the
  // instant this commits, the capability stops authorising any further
  // /api/order-assets or /api/render-print call (Gate 1 closure pass:
  // replaces a purely best-effort, post-success-only revoke, which left a
  // window open for those calls to race in and succeed while this route
  // was still creating the order). 'submitted' means an earlier call
  // already completed this exact submission — still proceed, since
  // create_authoritative_order's own content-fingerprint idempotency (not
  // a second guard here) is what makes that safe. Anything else (revoked,
  // expired, or a submissionKey that was never a real capability at all)
  // is rejected before ever touching S3 or the database.
  const capabilityState = submissionKey ? await beginBuilderSubmissionFinalising(submissionKey) : null;
  if (submissionKey && capabilityState !== 'finalising' && capabilityState !== 'submitted') {
    return NextResponse.json({ error: 'This order session is no longer available — please start a new order' }, { status: 409 });
  }

  console.info('Emblem production request received', {
    submissionKey: validated.params.p_submission_key,
    orderType: body.order?.type,
    ...validated.observability,
    clientPricingTier: body.pricing?.pricingTier,
    clientSubtotalPence: body.pricing?.subtotalPence,
    coachCardReceived: Boolean(validated.params.p_coach_card),
    contact: { name: body.contact?.name?.trim(), email: body.contact?.email?.trim(), phone: body.contact?.phone, team: body.contact?.team },
    submittedAt: body.submittedAt,
  });

  // Every referenced photo must genuinely exist in S3 and be an allowed
  // image type — checked before the RPC is ever called, so a forged or
  // stale-but-namespace-valid key can never reach a database write.
  const assetsVerified = await verifySubmittedAssetKeys(validated.assetsToVerify, async (key) => {
    try {
      const metadata = await headObject(key);
      return metadata;
    } catch (err) {
      console.error('S3 headObject failed during asset verification', err instanceof Error ? err.message : err);
      throw err;
    }
  });
  if (!assetsVerified.ok) {
    return NextResponse.json({ error: assetsVerified.error }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.rpc('create_authoritative_order', validated.params);

  // Only finish the transition if THIS call actually started it — a
  // capabilityState of 'submitted' means an earlier call already finished
  // it, so there is nothing to release back to 'active' or advance again.
  const justStartedFinalising = submissionKey !== undefined && capabilityState === 'finalising';

  if (error) {
    const message = error.message || '';
    // A failed create_authoritative_order call (transient DB error, or a
    // genuine content-mismatch retry) must not permanently strand the
    // customer's capability in 'finalising' — release it back to 'active'
    // so the same capability can be retried (with corrected content, if
    // that was the issue). Awaited, not fire-and-forget: the whole point
    // of this state machine is that the transition genuinely lands before
    // the response does.
    if (justStartedFinalising) await finishBuilderSubmissionFinalising(submissionKey, false);
    if (message.includes('reused with different content')) {
      return NextResponse.json({ error: 'This submission was already sent with different details' }, { status: 409 });
    }
    // Never leak internal database error detail/stack traces to the client.
    console.error('create_authoritative_order failed', message);
    return NextResponse.json({ error: 'Could not save your order — please try again' }, { status: 500 });
  }

  const result = data as { orderId: string; orderRef: string; created: boolean } | null;
  if (!result?.orderId) {
    if (justStartedFinalising) await finishBuilderSubmissionFinalising(submissionKey, false);
    console.error('create_authoritative_order returned an unexpected result', data);
    return NextResponse.json({ error: 'Could not save your order — please try again' }, { status: 500 });
  }

  // The submission has genuinely completed — its builder capability moves
  // to 'submitted', permanently blocking any further
  // /api/order-assets or /api/render-print call for it (verified by
  // verify_and_touch_builder_submission_capability's own state='active'
  // check). A failure here is logged (inside
  // finishBuilderSubmissionFinalising) but never blocks the customer's
  // order confirmation — and never leaves uploads/render open either,
  // since the capability simply stays in the already-blocking
  // 'finalising' state rather than reverting to 'active'.
  if (justStartedFinalising) await finishBuilderSubmissionFinalising(submissionKey, true);

  return NextResponse.json({
    ok: true,
    orderId: result.orderId,
    orderRef: result.orderRef,
    created: result.created,
    status: 'order_intent',
  });
}
