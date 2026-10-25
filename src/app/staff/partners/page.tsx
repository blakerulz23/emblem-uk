import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { commissionIsPayable, formatPence, formatPercentFromBps, PAYOUT_MINIMUM_PENCE, type CommissionStatus } from '@/lib/partner-programme';
import { AddCodeForm, CodeToggle, CreatePayoutButton, MarkSentForm, NotesForm, RatesForm, StatusActions } from './PartnerStaffActions';

export const dynamic = 'force-dynamic';

type Partner = {
  id: string; status: string; name: string; email: string; platform: string; profile_url: string; audience: string;
  commission_bps: number; customer_discount_bps: number; staff_notes: string | null; created_at: string;
};
type Code = { code: string; partner_id: string; active: boolean; discount_bps: number };
type Commission = {
  partner_id: string; commission_pence: number; status: CommissionStatus; hold_until: string;
  orders: { payment_status: string | null } | null;
};
type Payout = { id: string; partner_id: string; amount_pence: number; created_at: string; sent_at: string | null; sent_reference: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

const CARD = { border: '1px solid #e7e5e4', borderRadius: 14, padding: 16, background: '#fff', display: 'grid', gap: 10 };
const H = { fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 20, margin: '28px 0 12px' };
const SMALL = { fontSize: 13, color: '#57534e' };

/**
 * UK partner programme admin (migration 0095): vet applications, record the
 * Shopify code, and run monthly payouts. Partner contact data is private
 * and shown only here, to staff.
 */
export default async function StaffPartnersPage() {
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) redirect('/staff/login?next=/staff/partners');

  const service = createServiceRoleClient();
  const [{ data: partnersRaw }, { data: codesRaw }, { data: commissionsRaw }, { data: payoutsRaw }] = await Promise.all([
    service.from('partners').select('id, status, name, email, platform, profile_url, audience, commission_bps, customer_discount_bps, staff_notes, created_at').order('created_at', { ascending: false }),
    service.from('partner_codes').select('code, partner_id, active, discount_bps'),
    service.from('partner_commissions').select('partner_id, commission_pence, status, hold_until, orders ( payment_status )'),
    service.from('partner_payouts').select('id, partner_id, amount_pence, created_at, sent_at, sent_reference').order('created_at', { ascending: false }),
  ]);
  const partners = (partnersRaw ?? []) as Partner[];
  const codes = (codesRaw ?? []) as Code[];
  const commissions = (commissionsRaw ?? []) as unknown as Commission[];
  const payouts = (payoutsRaw ?? []) as Payout[];
  const now = new Date();

  const totals = (partnerId: string) => {
    const mine = commissions.filter((c) => c.partner_id === partnerId);
    return {
      orders: mine.length,
      payable: mine.filter((c) => commissionIsPayable(c, c.orders?.payment_status, now)).reduce((s, c) => s + c.commission_pence, 0),
      onHold: mine.filter((c) => c.status === 'pending' && !commissionIsPayable(c, c.orders?.payment_status, now)).reduce((s, c) => s + c.commission_pence, 0),
      paid: mine.filter((c) => c.status === 'paid').reduce((s, c) => s + c.commission_pence, 0),
    };
  };

  const applied = partners.filter((p) => p.status === 'applied');
  const others = partners.filter((p) => p.status !== 'applied');
  const unsent = payouts.filter((p) => !p.sent_at);
  const nameById = new Map(partners.map((p) => [p.id, p.name]));

  const partnerCard = (p: Partner) => {
    const t = totals(p.id);
    const myCodes = codes.filter((c) => c.partner_id === p.id);
    return (
      <div key={p.id} style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong>{p.name}</strong> <span style={SMALL}>· {p.status} · applied {formatDate(p.created_at)}</span>
            <div style={SMALL}>{p.email} · {p.platform} · <a href={p.profile_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>profile</a></div>
          </div>
          <StatusActions partnerId={p.id} status={p.status} />
        </div>
        <div style={{ ...SMALL, whiteSpace: 'pre-wrap' }}>Audience: {p.audience}</div>
        {p.status !== 'applied' && p.status !== 'rejected' && (
          <>
            <RatesForm partnerId={p.id} commissionBps={p.commission_bps} customerDiscountBps={p.customer_discount_bps} />
            <div style={SMALL}>
              Codes:{' '}
              {myCodes.length === 0 ? 'none yet' : myCodes.map((c) => (
                <span key={c.code} style={{ marginRight: 12 }}>
                  <strong>{c.code}</strong> ({formatPercentFromBps(c.discount_bps)} off{c.active ? '' : ', off'}) <CodeToggle partnerId={p.id} code={c.code} active={c.active} />
                </span>
              ))}
            </div>
            {p.status === 'active' && <AddCodeForm partnerId={p.id} discountPercent={formatPercentFromBps(p.customer_discount_bps)} />}
            <div style={SMALL}>
              {t.orders} order(s) · ready {formatPence(t.payable)} · on hold {formatPence(t.onHold)} · paid {formatPence(t.paid)}
            </div>
            {t.payable >= PAYOUT_MINIMUM_PENCE && <CreatePayoutButton partnerId={p.id} amount={formatPence(t.payable)} />}
          </>
        )}
        <NotesForm partnerId={p.id} notes={p.staff_notes ?? ''} />
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
      <h1 style={{ ...H, fontSize: 28, marginTop: 0 }}>Partners (UK)</h1>
      <p style={SMALL}>
        Before recording a code, create it in Shopify Admin: Discounts → Amount off products → the partner&rsquo;s customer discount %,
        applies to the UK card variant only, not combinable with other discounts. The percentage must match, or the order can&rsquo;t be
        marked paid. See docs/partner-programme-uk.md.
      </p>

      {unsent.length > 0 && (
        <>
          <h2 style={H}>Payouts to send ({unsent.length})</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {unsent.map((p) => (
              <div key={p.id} style={CARD}>
                <div><strong>{nameById.get(p.partner_id) ?? 'Partner'}</strong>: {formatPence(p.amount_pence)} <span style={SMALL}>created {formatDate(p.created_at)}</span></div>
                <MarkSentForm payoutId={p.id} />
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={H}>New applications ({applied.length})</h2>
      <div style={{ display: 'grid', gap: 10 }}>{applied.length ? applied.map(partnerCard) : <p style={SMALL}>None waiting.</p>}</div>

      <h2 style={H}>Partners ({others.length})</h2>
      <div style={{ display: 'grid', gap: 10 }}>{others.length ? others.map(partnerCard) : <p style={SMALL}>None yet.</p>}</div>

      {payouts.some((p) => p.sent_at) && (
        <>
          <h2 style={H}>Sent payouts</h2>
          <ul style={SMALL}>
            {payouts.filter((p) => p.sent_at).slice(0, 50).map((p) => (
              <li key={p.id}>{nameById.get(p.partner_id) ?? 'Partner'}: {formatPence(p.amount_pence)}, sent {formatDate(p.sent_at!)} (ref {p.sent_reference})</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
