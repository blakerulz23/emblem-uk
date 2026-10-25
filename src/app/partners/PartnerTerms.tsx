import Link from 'next/link';
import {
  COMMISSION_HOLD_DAYS,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_CUSTOMER_DISCOUNT_BPS,
  formatPence,
  formatPercentFromBps,
  PARTNER_TERMS_VERSION,
  PAYOUT_MINIMUM_PENCE,
} from '@/lib/partner-programme';
import { BODY, H2 } from './ui';

/** The UK partner terms, shown on the apply page and the dashboard. Version: PARTNER_TERMS_VERSION. */
export default function PartnerTerms() {
  return (
    <section id="terms">
      <h2 style={H2}>Partner terms</h2>
      <ol style={{ ...BODY, paddingLeft: 20, display: 'grid', gap: 8 }}>
        <li><strong>Who can join:</strong> adults (18+) based in the UK, posting from an account they run themselves. We don&rsquo;t accept accounts run by or for a child.</li>
        <li><strong>Your code:</strong> once approved, you get a personal code. Customers type it at checkout for {formatPercentFromBps(DEFAULT_CUSTOMER_DISCOUNT_BPS)} off a personalised card. It doesn&rsquo;t apply to Squad Invite team orders, whose price is set by the squad.</li>
        <li><strong>Commission:</strong> {formatPercentFromBps(DEFAULT_COMMISSION_BPS)} of what the customer paid for cards (after their discount, not counting delivery), unless we agree a different rate with you in writing. Your rate is shown on your dashboard.</li>
        <li><strong>When it&rsquo;s paid:</strong> commission is held for {COMMISSION_HOLD_DAYS} days after payment. Refunded or cancelled orders, and your own orders, earn nothing. We pay by bank transfer each month once you&rsquo;re owed at least {formatPence(PAYOUT_MINIMUM_PENCE)}. You&rsquo;re responsible for your own tax.</li>
        <li><strong>Always say it&rsquo;s an ad:</strong> put &ldquo;Ad&rdquo; at the very start of the caption or on screen, and turn on the platform&rsquo;s paid-partnership label. &ldquo;Gifted&rdquo;, &ldquo;collab&rdquo; or just tagging us isn&rsquo;t enough. This applies to gifted cards too. See the{' '}
          <a href="https://www.asa.org.uk/resource/influencers-guide.html" style={{ color: 'var(--accent)' }} target="_blank" rel="noreferrer">ASA influencers&rsquo; guide</a>.</li>
        <li><strong>Talk to parents, never to children:</strong> never ask children to buy. Only feature a child with their parent&rsquo;s permission, and never show a child&rsquo;s face together with their full name, club and town.</li>
        <li><strong>Be honest:</strong> share your genuine experience. No made-up reviews or reactions, and no claims about the product beyond what&rsquo;s on emblem.cards.</li>
        <li><strong>Where codes go:</strong> your own channels only. Not on voucher or coupon sites, and not in paid search ads using the Emblem name.</li>
        <li><strong>What you see:</strong> your dashboard shows order dates and amounts, never who bought or anything about their child.</li>
        <li><strong>Ending:</strong> either side can end the partnership at any time. Commission already earned on valid orders is still paid.</li>
      </ol>
      <p style={{ ...BODY, fontSize: 13.5, color: 'var(--ink-faint)', marginTop: 12 }}>
        Terms version {PARTNER_TERMS_VERSION}. We use your name, email, profile link and the details you give us only to run the
        partner programme; see our <Link href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</Link>.
      </p>
    </section>
  );
}
