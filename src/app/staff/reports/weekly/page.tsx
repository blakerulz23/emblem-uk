import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { buildWeeklyOrderReport, type JourneyCounts, type ReportOrder, type ReportPaymentEvent, type ReportSquadInviteEvent } from '@/lib/weekly-order-report';

export const dynamic = 'force-dynamic';

const WEEKS = 8;

/**
 * Weekly orders, checkout attempts and confirmed payments (staff only,
 * read-only). Counts come from the database's own order and payment records
 * (see weekly-order-report.ts) — never from website analytics, and a
 * checkout attempt is never counted as a sale. Shows counts only: no names,
 * emails or order details.
 */
export default async function StaffWeeklyReportPage() {
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) redirect('/staff/login?next=/staff/reports/weekly');

  const service = createServiceRoleClient();
  const since = new Date(Date.now() - (WEEKS * 7 + 7) * 86_400_000).toISOString();
  const [ordersRes, eventsRes, siRes] = await Promise.all([
    service.from('orders').select('id, source, created_at').gte('created_at', since),
    service.from('payment_state_events').select('order_id, to_status, reason, created_at').gte('created_at', since),
    service.from('squad_invite_audit_events').select('participation_id, event_type, created_at').eq('event_type', 'payment_preview_opened').gte('created_at', since),
  ]);
  const failed = ordersRes.error || eventsRes.error || siRes.error;
  const orders = (ordersRes.data ?? []) as ReportOrder[];
  const paymentEvents = (eventsRes.data ?? []) as ReportPaymentEvent[];

  // Sources for orders an event refers to but which were created before the window.
  const orderSources = new Map<string, string | null>(orders.map((o) => [o.id, o.source]));
  const missing = Array.from(new Set(paymentEvents.map((e) => e.order_id).filter((id): id is string => Boolean(id) && !orderSources.has(id as string))));
  if (missing.length) {
    const { data } = await service.from('orders').select('id, source').in('id', missing);
    for (const o of (data ?? []) as { id: string; source: string | null }[]) orderSources.set(o.id, o.source);
  }

  const rows = failed ? [] : buildWeeklyOrderReport({
    orders,
    orderSources,
    paymentEvents,
    squadInviteEvents: (siRes.data ?? []) as ReportSquadInviteEvent[],
    now: new Date(),
    weeks: WEEKS,
  });

  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, borderBottom: '1px solid var(--line)' };
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' };
  const cells = (c: JourneyCounts) => (
    <>
      <td style={td}>{c.orders}</td>
      <td style={td}>{c.checkoutAttempts}</td>
      <td style={{ ...td, fontWeight: 800 }}>{c.paid}</td>
      <td style={td}>{c.refunded}</td>
    </>
  );

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 64px' }}>
      <Link href="/staff/queue" style={{ color: 'var(--ink-soft)', fontSize: 13 }}>&larr; Staff queue</Link>
      <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontSize: 26, margin: '10px 0 6px' }}>Weekly orders and payments</h1>
      <p style={{ color: 'var(--ink-soft)', maxWidth: 760, lineHeight: 1.5 }}>
        From Emblem&rsquo;s own order and payment records, not website analytics. Weeks run Monday to Sunday (UK time).
        Includes internal test orders.
      </p>
      {failed ? (
        <p role="alert" style={{ color: '#b91c1c' }}>The report couldn&rsquo;t be loaded. Please try again.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 18 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760, fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>Week starting</th>
                <th style={{ ...th, textAlign: 'center' }} colSpan={4}>Direct orders</th>
                <th style={{ ...th, textAlign: 'center' }} colSpan={4}>Squad Invite</th>
              </tr>
              <tr>
                <th style={th}>Orders</th><th style={th}>Checkout attempts</th><th style={th}>Paid</th><th style={th}>Refunded</th>
                <th style={th}>Orders</th><th style={th}>Payment page opened</th><th style={th}>Paid</th><th style={th}>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.weekStart}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    {new Date(`${r.weekStart}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  {cells(r.direct)}
                  {cells(r.squadInvite)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 style={{ fontSize: 16, marginTop: 28 }}>What each column means</h2>
      <ul style={{ color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 820 }}>
        <li><strong>Orders</strong>: distinct orders created that week.</li>
        <li><strong>Checkout attempts</strong> (direct): distinct orders whose Shopify checkout was first opened that week. Re-opening the same order isn&rsquo;t counted again, so this is orders reaching checkout, not clicks.</li>
        <li><strong>Payment page opened</strong> (Squad Invite): distinct families who opened their payment page that week, the step before Shopify.</li>
        <li><strong>Paid</strong>: distinct orders confirmed paid that week by Shopify&rsquo;s signed payment notification. This is the only column that means money was taken.</li>
        <li><strong>Refunded</strong>: distinct orders refunded that week. A refunded order still appears as paid in the week it was paid.</li>
        <li>An order can be created one week and paid in another, so columns in one row don&rsquo;t have to add up.</li>
      </ul>
    </main>
  );
}
