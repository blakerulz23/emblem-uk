import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

/**
 * Guardian-controlled card-front sharing (Work Package B, draft) — consent
 * recording. record_card_share_consent (migration 0078) re-derives
 * eligibility itself for a 'confirmed' result — this route never trusts a
 * client-supplied "I already checked eligibility" claim, and a genuine
 * ineligibility at the moment of calling surfaces as an ordinary error
 * response, not a silently-recorded consent event.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    orderId?: unknown;
    consentVersion?: unknown;
    result?: unknown;
  } | null;

  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  const consentVersion = typeof body?.consentVersion === 'string' ? body.consentVersion : '';
  const result = typeof body?.result === 'string' ? body.result : '';

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  if (result !== 'confirmed' && result !== 'cancelled') {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }
  if (!consentVersion) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: 'Please verify your email first' }, { status: 401 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'card-share-consent', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('record_card_share_consent', {
    p_order_id: orderId,
    p_consent_version: consentVersion,
    p_result: result,
  });

  if (error) {
    console.error('card-share/consent:rpc', error.message);
    return NextResponse.json({ error: 'Sharing is not available for this design' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: (data as { result?: string } | null)?.result }, { headers: { 'Cache-Control': 'no-store' } });
}
