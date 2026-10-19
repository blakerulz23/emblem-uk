import { describe, expect, it } from 'vitest';
import { FRESH_SIGN_IN_MS, isFreshSignIn, listRecoverableOrders } from './unpaid-order-recovery';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('isFreshSignIn — guardian verification expiry', () => {
  it('accepts a code entered within 30 minutes', () => {
    expect(isFreshSignIn(new Date(NOW - 60_000).toISOString(), NOW)).toBe(true);
    expect(isFreshSignIn(new Date(NOW - FRESH_SIGN_IN_MS).toISOString(), NOW)).toBe(true);
  });
  it('refuses a session older than 30 minutes, a missing or invalid time, and a future time beyond clock skew', () => {
    expect(isFreshSignIn(new Date(NOW - FRESH_SIGN_IN_MS - 1000).toISOString(), NOW)).toBe(false);
    expect(isFreshSignIn(null, NOW)).toBe(false);
    expect(isFreshSignIn(undefined, NOW)).toBe(false);
    expect(isFreshSignIn('not a date', NOW)).toBe(false);
    expect(isFreshSignIn(new Date(NOW + 10 * 60_000).toISOString(), NOW)).toBe(false);
  });
});

type Row = Record<string, unknown>;

// In-memory stand-in for the service-role client that really applies the
// filters the module sends, so the test proves behaviour, not call shapes.
function fakeService(tables: Record<string, Row[]>) {
  return {
    from(name: string) {
      const preds: Array<(r: Row) => boolean> = [];
      let order: { col: string; asc: boolean } | null = null;
      let limit = Infinity;
      const run = () => {
        let rows = (tables[name] ?? []).filter((r) => preds.every((p) => p(r)));
        if (order) rows = [...rows].sort((a, b) => (String(a[order!.col]) < String(b[order!.col]) ? -1 : 1) * (order!.asc ? 1 : -1));
        rows = rows.slice(0, limit);
        if (name === 'cards') rows = rows.map((c) => ({ ...c, players: (tables.players ?? []).find((p) => p.id === c.player_id) ?? null }));
        return { data: rows, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return q; },
        neq: (c: string, v: unknown) => { preds.push((r) => r[c] !== v); return q; },
        in: (c: string, vs: unknown[]) => { preds.push((r) => vs.includes(r[c])); return q; },
        not: (c: string) => { preds.push((r) => r[c] !== null && r[c] !== undefined); return q; },
        gte: (c: string, v: string) => { preds.push((r) => String(r[c]) >= v); return q; },
        order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q; },
        limit: (n: number) => { limit = n; return q; },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return q;
    },
  } as never;
}

const ME = 'user-me';
const OTHER = 'user-other';
const order = (id: string, over: Row = {}): Row => ({
  id, order_ref: `EMB-${id}`, created_at: daysAgo(1), total_print_quantity: 1, subtotal_pence: 2499, currency: 'GBP',
  payment_status: 'order_intent', authority_status: 'confirmed', source: 'standalone_order', pricing_tier: 'single', ...over,
});

function world() {
  return {
    builder_order_authority_declarations: [
      { order_id: 'mine-1', adult_user_id: ME },
      { order_id: 'mine-pending', adult_user_id: ME },
      { order_id: 'mine-paid', adult_user_id: ME },
      { order_id: 'mine-refunded', adult_user_id: ME },
      { order_id: 'mine-cancelled', adult_user_id: ME },
      { order_id: 'mine-fulfilled', adult_user_id: ME },
      { order_id: 'mine-failed', adult_user_id: ME },
      { order_id: 'mine-old', adult_user_id: ME },
      { order_id: 'mine-multi', adult_user_id: ME },
      { order_id: 'mine-guardian-pending', adult_user_id: ME },
      { order_id: 'mine-squad-invite', adult_user_id: ME },
      { order_id: null, adult_user_id: ME },
      { order_id: 'theirs-1', adult_user_id: OTHER },
    ],
    orders: [
      order('mine-1'),
      order('mine-pending', { payment_status: 'pending_payment', created_at: daysAgo(2) }),
      order('mine-paid', { payment_status: 'paid' }),
      order('mine-refunded', { payment_status: 'refunded' }),
      order('mine-cancelled', { payment_status: 'cancelled' }),
      order('mine-fulfilled', { payment_status: 'fulfilled' }),
      order('mine-failed', { payment_status: 'failed' }),
      order('mine-old', { created_at: daysAgo(31) }),
      order('mine-multi', { pricing_tier: 'multi', total_print_quantity: 3, subtotal_pence: 6597 }),
      order('mine-guardian-pending', { authority_status: 'guardian_pending' }),
      order('mine-squad-invite', { source: 'squad_invite' }),
      order('theirs-1'),
    ],
    cards: [
      { order_id: 'mine-1', player_id: 'p1' },
      { order_id: 'mine-pending', player_id: 'p2' },
      { order_id: 'theirs-1', player_id: 'p3' },
    ],
    players: [
      { id: 'p1', name: 'Riley H' },
      { id: 'p2', name: 'Sam K' },
      { id: 'p3', name: 'Jordan Other' },
    ],
  };
}

describe('listRecoverableOrders — payment recovery eligibility', () => {
  it('lists only this adult’s unpaid single-card direct orders from the last 30 days, newest first', async () => {
    const result = await listRecoverableOrders(fakeService(world()), ME, NOW);
    expect(result.map((o) => o.orderId)).toEqual(['mine-1', 'mine-pending']);
  });

  it('never returns another family’s order, even with the same status', async () => {
    const result = await listRecoverableOrders(fakeService(world()), ME, NOW);
    expect(JSON.stringify(result)).not.toMatch(/theirs-1|Jordan/);
    const theirs = await listRecoverableOrders(fakeService(world()), OTHER, NOW);
    expect(theirs.map((o) => o.orderId)).toEqual(['theirs-1']);
  });

  it('refuses paid, fulfilled, refunded, cancelled and failed orders', async () => {
    const ids = (await listRecoverableOrders(fakeService(world()), ME, NOW)).map((o) => o.orderId);
    for (const id of ['mine-paid', 'mine-fulfilled', 'mine-refunded', 'mine-cancelled', 'mine-failed']) expect(ids).not.toContain(id);
  });

  it('excludes orders older than 30 days, multi-card tiers checkout can’t take, guardian-pending and Squad Invite orders', async () => {
    const ids = (await listRecoverableOrders(fakeService(world()), ME, NOW)).map((o) => o.orderId);
    for (const id of ['mine-old', 'mine-multi', 'mine-guardian-pending', 'mine-squad-invite']) expect(ids).not.toContain(id);
  });

  it('returns only what the parent needs to recognise the order: first name, ref, date, count, stored total', async () => {
    const [first, second] = await listRecoverableOrders(fakeService(world()), ME, NOW);
    expect(Object.keys(first).sort()).toEqual(['cardCount', 'checkoutStarted', 'createdAt', 'currency', 'orderId', 'orderRef', 'playerFirstNames', 'totalPence']);
    expect(first).toMatchObject({ orderRef: 'EMB-mine-1', playerFirstNames: ['Riley'], totalPence: 2499, cardCount: 1, checkoutStarted: false });
    expect(second).toMatchObject({ playerFirstNames: ['Sam'], checkoutStarted: true }); // a checkout was opened before
  });

  it('an adult with no declarations gets an empty list', async () => {
    expect(await listRecoverableOrders(fakeService(world()), 'nobody', NOW)).toEqual([]);
  });
});
