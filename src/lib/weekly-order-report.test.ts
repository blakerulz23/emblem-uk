import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildWeeklyOrderReport, londonWeekStart } from './weekly-order-report';

// Wednesday 21 Oct 2026, 10:00 UK (BST)
const NOW = new Date('2026-10-21T09:00:00Z');

describe('londonWeekStart', () => {
  it('uses Monday-to-Sunday weeks in UK time, including late Sunday and BST edges', () => {
    expect(londonWeekStart('2026-10-19T00:30:00+01:00')).toBe('2026-10-19'); // Monday 00:30 BST
    expect(londonWeekStart('2026-10-18T23:30:00Z')).toBe('2026-10-19'); // Monday 00:30 BST, still Sunday in UTC
    expect(londonWeekStart('2026-10-25T23:59:00Z')).toBe('2026-10-19'); // Sunday 23:59 GMT (clocks went back)
    expect(londonWeekStart('2026-10-26T00:00:00Z')).toBe('2026-10-26');
  });
});

describe('buildWeeklyOrderReport', () => {
  const orders = [
    { id: 'd1', source: 'team_order', created_at: '2026-10-19T10:00:00Z' },
    { id: 'd2', source: 'standalone_order', created_at: '2026-10-20T10:00:00Z' },
    { id: 's1', source: 'squad_invite', created_at: '2026-10-20T11:00:00Z' },
    { id: 'old', source: 'team_order', created_at: '2026-10-13T10:00:00Z' },
  ];
  const orderSources = new Map<string, string | null>([...orders.map((o) => [o.id, o.source] as [string, string]), ['earlier', 'team_order'], ['siEarlier', 'squad_invite']]);
  const report = buildWeeklyOrderReport({
    orders,
    orderSources,
    paymentEvents: [
      { order_id: 'd1', to_status: 'pending_payment', reason: 'checkout_initiated', created_at: '2026-10-19T10:05:00Z' },
      { order_id: 'd1', to_status: 'paid', reason: 'orders/paid', created_at: '2026-10-19T10:15:00Z' },
      { order_id: 'd2', to_status: 'pending_payment', reason: 'checkout_initiated', created_at: '2026-10-20T10:05:00Z' },
      { order_id: 'earlier', to_status: 'paid', reason: 'orders/paid', created_at: '2026-10-20T09:00:00Z' }, // created in an earlier week
      { order_id: 'earlier', to_status: 'refunded', reason: 'refunds/create', created_at: '2026-10-21T08:00:00Z' },
      { order_id: 's1', to_status: 'paid', reason: 'orders/paid', created_at: '2026-10-20T12:00:00Z' },
      { order_id: 'old', to_status: 'pending_payment', reason: 'checkout_initiated', created_at: '2026-10-13T10:05:00Z' },
      { order_id: null, to_status: 'paid', reason: 'orders/paid', created_at: '2026-10-20T12:00:00Z' },
    ],
    squadInviteEvents: [
      { participation_id: 'p1', event_type: 'payment_preview_opened', created_at: '2026-10-20T11:30:00Z' },
      { participation_id: 'p1', event_type: 'payment_preview_opened', created_at: '2026-10-20T11:40:00Z' }, // same family again
      { participation_id: 'p2', event_type: 'payment_preview_opened', created_at: '2026-10-21T08:00:00Z' },
      { participation_id: 'p3', event_type: 'payment_requested', created_at: '2026-10-21T08:00:00Z' }, // not an attempt
    ],
    now: NOW,
    weeks: 3,
  });

  it('returns the requested weeks, newest first, including empty weeks', () => {
    expect(report.map((r) => r.weekStart)).toEqual(['2026-10-19', '2026-10-12', '2026-10-05']);
    expect(report[2].direct).toEqual({ orders: 0, checkoutAttempts: 0, paid: 0, refunded: 0 });
  });

  it('counts distinct orders, checkout attempts and confirmed payments per journey', () => {
    expect(report[0].direct).toEqual({ orders: 2, checkoutAttempts: 2, paid: 2, refunded: 1 });
    expect(report[0].squadInvite).toEqual({ orders: 1, checkoutAttempts: 2, paid: 1, refunded: 0 });
    expect(report[1].direct).toEqual({ orders: 1, checkoutAttempts: 1, paid: 0, refunded: 0 });
  });

  it('a payment counts in the week it was confirmed, even for an order created earlier, and a refund never removes it', () => {
    expect(report[0].direct.paid).toBe(2); // d1 + 'earlier'
    expect(report[0].direct.refunded).toBe(1);
  });

  it('a checkout attempt is never counted as a payment, and Squad Invite payment requests are not attempts', () => {
    expect(report[1].direct.paid).toBe(0);
    expect(report[0].squadInvite.checkoutAttempts).toBe(2); // p1 once, p2; p3's payment_requested ignored
  });
});

describe('staff report page', () => {
  const page = readFileSync('src/app/staff/reports/weekly/page.tsx', 'utf8');
  it('is staff-only and read-only, from order and payment records', () => {
    expect(page).toMatch(/const staffCheck = await requireStaff\(createClient\(\)\);\s*if \(!staffCheck\.ok\) redirect\('\/staff\/login\?next=\/staff\/reports\/weekly'\);/);
    expect(page).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(page).toContain("from('payment_state_events').select('order_id, to_status, reason, created_at')");
  });
  it('shows counts only: no names, emails or order references', () => {
    expect(page).not.toMatch(/purchaser_email|order_ref|players|name:/);
  });
});
