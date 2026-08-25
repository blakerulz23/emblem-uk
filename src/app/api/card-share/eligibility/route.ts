import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { consumeAnonymousRequestRateLimit } from '@/lib/anonymous-request-rate-limit';
import { hasValidBuilderCsrf } from '@/lib/builder-request-security';

/**
 * Guardian-controlled card-front sharing (Work Package B, draft) —
 * eligibility check. Read-only: computed fresh by get_card_share_
 * eligibility (migration 0078) on every call, never cached here or
 * trusted from an earlier response. Requires the same verified-adult
 * Supabase Auth session Adult Permission already established — this route
 * does not create or accept any new form of identity.
 */
export async function POST(request: NextRequest) {
  if (!hasValidBuilderCsrf(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });

  const body = await request.json().catch(() => null) as { orderId?: unknown } | null;
  const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ ok: false, eligible: false, reason: 'not_authenticated' }, { status: 200 });
  }

  if (!(await consumeAnonymousRequestRateLimit(request.headers, 'card-share-eligibility', userData.user.email ?? undefined))) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 429 });
  }

  const { data, error } = await supabase.rpc('get_card_share_eligibility', { p_order_id: orderId });
  if (error) {
    console.error('card-share/eligibility:rpc', error.message);
    // Fail closed: a genuine RPC error never reveals eligible:true.
    return NextResponse.json({ ok: false, eligible: false, reason: 'not_authorized' }, { status: 200 });
  }

  const result = data as { eligible?: boolean; reason?: string; cardId?: string; artworkCardDefinitionId?: string } | null;
  return NextResponse.json(
    { ok: true, eligible: Boolean(result?.eligible), reason: result?.reason, cardId: result?.cardId, artworkCardDefinitionId: result?.artworkCardDefinitionId },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
