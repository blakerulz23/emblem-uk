import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { commissionIsPayable, formatPence, formatPercentFromBps, partnerCaption, PAYOUT_MINIMUM_PENCE, type CommissionStatus } from '@/lib/partner-programme';
import PartnerSignIn from './PartnerSignIn';
import PartnerTerms from './PartnerTerms';
import { CopyField, SignOutButton } from './PartnerClientBits';
import { BODY, BOX, EYEBROW, H1, H2 } from './ui';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Partner dashboard | Emblem', robots: { index: false } };

type CommissionRow = {
  id: string;
  code: string;
  paid_subtotal_pence: number;
  commission_pence: number;
  status: CommissionStatus;
  void_reason: string | null;
  hold_until: string;
  created_at: string;
  orders: { payment_status: string | null } | null;
};

const VOID_LABELS: Record<string, string> = {
  self_order: 'own order',
  partner_inactive: 'account paused',
  code_inactive: 'code switched off',
  refunded: 'refunded',
  cancelled: 'cancelled',
  staff: 'removed',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The partner's own dashboard. The signed-in user's verified email (Supabase
 * one-time code) is matched to partners.email; everything is read with the
 * service role and filtered to that one partner. Shows order dates and
 * amounts only — never who bought or anything about their child.
 */
export default async function PartnerDashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return <PartnerSignIn />;

  const service = createServiceRoleClient();
  const { data: partner } = await service
    .from('partners')
    .select('id, name, status, commission_bps, customer_discount_bps')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <span style={EYEBROW}>Partner dashboard</span>
      {children}
      <p style={{ ...BODY, marginTop: 32, fontSize: 14 }}>Signed in as {user.email} · <SignOutButton /></p>
    </div>
  );

  if (!partner) {
    return shell(
      <>
        <h1 style={H1}>No partner account for this email</h1>
        <p style={{ ...BODY, marginTop: 16 }}>
          Sign in with the email you applied with, or <Link href="/partners/apply" style={{ color: 'var(--accent)' }}>apply to become a partner</Link>.
        </p>
      </>,
    );
  }
  if (partner.status === 'applied') {
    return shell(
      <>
        <h1 style={H1}>Thanks, {partner.name}. We&rsquo;re reviewing your application</h1>
        <p style={{ ...BODY, marginTop: 16 }}>We&rsquo;ll email you once it&rsquo;s approved, and your code will appear here.</p>
      </>,
    );
  }
  if (partner.status === 'rejected') {
    return shell(
      <>
        <h1 style={H1}>Your application wasn&rsquo;t approved</h1>
        <p style={{ ...BODY, marginTop: 16 }}>Thanks for your interest. If you have questions, email hello@emblem.cards.</p>
      </>,
    );
  }

  const [{ data: codes }, { data: commissionsRaw }, { data: payouts }] = await Promise.all([
    service.from('partner_codes').select('code, active, discount_bps').eq('partner_id', partner.id).order('created_at'),
    service
      .from('partner_commissions')
      .select('id, code, paid_subtotal_pence, commission_pence, status, void_reason, hold_until, created_at, orders ( payment_status )')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(200),
    service.from('partner_payouts').select('id, amount_pence, created_at, sent_at').eq('partner_id', partner.id).order('created_at', { ascending: false }).limit(24),
  ]);
  const commissions = (commissionsRaw ?? []) as unknown as CommissionRow[];
  const now = new Date();
  const payable = commissions.filter((c) => commissionIsPayable(c, c.orders?.payment_status, now)).reduce((sum, c) => sum + c.commission_pence, 0);
  const onHold = commissions.filter((c) => c.status === 'pending' && !commissionIsPayable(c, c.orders?.payment_status, now)).reduce((sum, c) => sum + c.commission_pence, 0);
  const paid = commissions.filter((c) => c.status === 'paid').reduce((sum, c) => sum + c.commission_pence, 0);
  const activeCodes = (codes ?? []).filter((c) => c.active);

  return shell(
    <>
      <h1 style={H1}>Hi {partner.name}</h1>
      {partner.status === 'paused' && (
        <div style={BOX}>Your partnership is paused, so new orders don&rsquo;t earn commission. Email hello@emblem.cards with any questions.</div>
      )}
      <p style={{ ...BODY, marginTop: 16 }}>
        Your commission: <strong>{formatPercentFromBps(partner.commission_bps)}</strong> of what customers pay for cards. Your audience gets{' '}
        <strong>{formatPercentFromBps(partner.customer_discount_bps)}</strong> off with your code at checkout.
      </p>

      <h2 style={H2}>Your code</h2>
      {activeCodes.length === 0 ? (
        <p style={BODY}>Your code is being set up. It&rsquo;ll appear here shortly.</p>
      ) : (
        activeCodes.map((c) => (
          <div key={c.code}>
            <CopyField label="Code" value={c.code} />
            <CopyField label="Link to share" value={`https://emblem.cards/p/${c.code}`} />
            <CopyField label="Caption (keep “Ad” at the start)" value={partnerCaption(c.code, c.discount_bps)} />
          </div>
        ))
      )}

      <h2 style={H2}>Earnings</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          ['Ready to pay', formatPence(payable)],
          ['On hold', formatPence(onHold)],
          ['Paid to you', formatPence(paid)],
        ].map(([label, value]) => (
          <div key={label} style={{ ...BOX, marginTop: 0 }}>
            <div style={{ fontSize: 13 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 24 }}>{value}</div>
          </div>
        ))}
      </div>
      <p style={{ ...BODY, fontSize: 13.5, marginTop: 8 }}>
        Paid monthly by bank transfer once at least {formatPence(PAYOUT_MINIMUM_PENCE)} is ready. We&rsquo;ll email you for bank details before your first payment.
      </p>

      <h2 style={H2}>Orders</h2>
      {commissions.length === 0 ? (
        <p style={BODY}>No orders yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ ...BODY, fontSize: 14, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}><th>Date</th><th>Code</th><th>Paid for cards</th><th>Commission</th><th>Status</th></tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--line, #e7e5e4)' }}>
                  <td>{formatDate(c.created_at)}</td>
                  <td>{c.code}</td>
                  <td>{formatPence(c.paid_subtotal_pence)}</td>
                  <td>{formatPence(c.commission_pence)}</td>
                  <td>
                    {c.status === 'void'
                      ? `No commission (${VOID_LABELS[c.void_reason ?? ''] ?? 'void'})`
                      : c.status === 'paid'
                        ? 'Paid'
                        : commissionIsPayable(c, c.orders?.payment_status, now)
                          ? 'Ready to pay'
                          : `On hold until ${formatDate(c.hold_until)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(payouts ?? []).length > 0 && (
        <>
          <h2 style={H2}>Payments</h2>
          <ul style={{ ...BODY, paddingLeft: 20 }}>
            {(payouts ?? []).map((p) => (
              <li key={p.id}>{formatPence(p.amount_pence)}: {p.sent_at ? `sent ${formatDate(p.sent_at)}` : 'being prepared'}</li>
            ))}
          </ul>
        </>
      )}

      <PartnerTerms />
    </>,
  );
}
