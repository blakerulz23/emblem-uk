import type { Metadata } from 'next';
import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { formatPercentFromBps, normalizePartnerCode } from '@/lib/partner-programme';
import { BODY, BOX, BUTTON, EYEBROW, H1 } from '@/app/partners/ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Emblem code | Emblem', robots: { index: false } };

/**
 * emblem.cards/p/CODE — the link a partner shares. It sets no cookie and
 * stores nothing: it shows the code and how to use it, and the customer
 * types it at checkout themselves (that's what credits the partner). An
 * unknown or switched-off code gets the same page without a discount, so
 * the page never reveals which codes exist beyond what partners publish.
 */
export default async function PartnerLinkPage({ params }: { params: { code: string } }) {
  const code = normalizePartnerCode(decodeURIComponent(params.code));
  let discountBps = 0;
  if (code) {
    const { data } = await createServiceRoleClient()
      .from('partner_codes')
      .select('code, active, discount_bps, partners!inner ( status )')
      .eq('code', code)
      .maybeSingle();
    const partnerStatus = (data as { partners?: { status?: string } } | null)?.partners?.status;
    if (data?.active && partnerStatus === 'active') discountBps = data.discount_bps as number;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <span style={EYEBROW}>Personalised football cards</span>
      <h1 style={H1}>Make your player&rsquo;s own football card</h1>
      <p style={{ ...BODY, marginTop: 16 }}>
        Their name, photo and club on a real trading card, with a chip that opens their private player profile. Only you see it.
      </p>
      {discountBps > 0 && code ? (
        <div style={BOX}>
          Use code <strong style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 17 }}>{code}</strong> at checkout for{' '}
          <strong>{formatPercentFromBps(discountBps)} off</strong> your card.
        </div>
      ) : null}
      <p style={{ marginTop: 24 }}>
        <Link href="/builder" style={BUTTON}>Start your card</Link>
      </p>
      <p style={{ ...BODY, fontSize: 13.5, marginTop: 20 }}>
        The code works on personalised cards ordered through the builder. It doesn&rsquo;t apply to Squad Invite team orders. The
        creator who shared this link may earn a commission if you use their code.
      </p>
    </div>
  );
}
