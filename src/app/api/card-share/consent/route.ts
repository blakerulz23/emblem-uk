import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Records guardian consent to share a card front on socials (migration
 * 0078). Accepts only orderId and the two confirmation booleans from the
 * client — everything else (which card this order produced, whether its
 * artwork is cleared for social sharing, whether the caller is genuinely
 * that card's verified guardian, and the card-version hash) is derived
 * entirely inside record_card_share_consent from server-held state. This
 * route never touches the exported image itself; that never leaves the
 * guardian's own browser.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === 'string' ? body.orderId : null;
  const confirmedAuthority = body?.confirmedAuthority === true;
  const confirmedRecallUnderstanding = body?.confirmedRecallUnderstanding === true;
  const consentWordingVersion = typeof body?.consentWordingVersion === 'string' ? body.consentWordingVersion : null;

  if (!orderId || !consentWordingVersion) {
    return NextResponse.json({ error: 'orderId and consentWordingVersion are required' }, { status: 400 });
  }
  if (!confirmedAuthority || !confirmedRecallUnderstanding) {
    return NextResponse.json({ error: 'Both confirmations are required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('record_card_share_consent', {
    p_order_id: orderId,
    p_confirmed_authority: confirmedAuthority,
    p_confirmed_recall_understanding: confirmedRecallUnderstanding,
    p_consent_wording_version: consentWordingVersion,
  });

  if (error) {
    // Generic, non-distinguishing response for every rejection reason
    // (not authorized / artwork not cleared / card not found) — matches
    // this codebase's existing discipline (respond_to_builder_guardian_
    // approval, card-lookup.ts) of never giving an untrusted caller an
    // oracle for which specific check failed.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const result = data as { ok: boolean; consentId?: string } | null;
  return NextResponse.json({ ok: result?.ok === true });
}
