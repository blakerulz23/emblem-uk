import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { headObject } from '@/lib/s3-client';
import { validateOrderEnquiry, verifySubmittedAssetKeys, type EnquiryBody } from '@/lib/order-enquiry-validation';

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
export async function POST(request: Request) {
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

  if (error) {
    const message = error.message || '';
    if (message.includes('reused with different content')) {
      return NextResponse.json({ error: 'This submission was already sent with different details' }, { status: 409 });
    }
    // Never leak internal database error detail/stack traces to the client.
    console.error('create_authoritative_order failed', message);
    return NextResponse.json({ error: 'Could not save your order — please try again' }, { status: 500 });
  }

  const result = data as { orderId: string; orderRef: string; created: boolean } | null;
  if (!result?.orderId) {
    console.error('create_authoritative_order returned an unexpected result', data);
    return NextResponse.json({ error: 'Could not save your order — please try again' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    orderId: result.orderId,
    orderRef: result.orderRef,
    created: result.created,
    status: 'order_intent',
  });
}
