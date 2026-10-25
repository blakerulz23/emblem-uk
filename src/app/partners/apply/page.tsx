import type { Metadata } from 'next';
import Link from 'next/link';
import { COMMISSION_HOLD_DAYS, DEFAULT_COMMISSION_BPS, DEFAULT_CUSTOMER_DISCOUNT_BPS, formatPercentFromBps } from '@/lib/partner-programme';
import ApplyForm from './ApplyForm';
import PartnerTerms from '../PartnerTerms';
import { BODY, BOX, EYEBROW, H1 } from '../ui';

export const metadata: Metadata = {
  title: 'Become an Emblem partner | Emblem',
  description: 'For UK creators, coaches and football parents: share personalised grassroots football cards and earn commission.',
};

export default function PartnerApplyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <span style={EYEBROW}>Partner programme · UK</span>
      <h1 style={H1}>Share Emblem with football families and earn</h1>
      <p style={{ ...BODY, marginTop: 20 }}>
        For UK creators, grassroots coaches and football parents who post about junior football. Your audience gets{' '}
        {formatPercentFromBps(DEFAULT_CUSTOMER_DISCOUNT_BPS)} off a personalised card with your code, and you earn{' '}
        {formatPercentFromBps(DEFAULT_COMMISSION_BPS)} of what they pay.
      </p>
      <div style={BOX}>
        <strong>In short:</strong> apply below, and we review every creator by hand. Once approved, you get a code and a dashboard
        showing your orders and earnings. Commission clears {COMMISSION_HOLD_DAYS} days after each order and is paid monthly by bank
        transfer. Every post must be labelled as an ad.
      </div>
      <ApplyForm />
      <PartnerTerms />
      <p style={{ ...BODY, marginTop: 28 }}>
        Already a partner? <Link href="/partners" style={{ color: 'var(--accent)' }}>Sign in to your dashboard</Link>.
      </p>
    </div>
  );
}
