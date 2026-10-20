/**
 * Weekly order report (staff, read-only) — built only from the database's
 * own records, never from analytics:
 *
 *   Orders              distinct orders created that week (orders.created_at)
 *   Checkout attempts   direct: distinct orders whose Shopify checkout was
 *                       first opened that week (payment_state_events reason
 *                       'checkout_initiated' — only the first opening of an
 *                       order is recorded, so this counts orders, not clicks).
 *                       Squad Invite: distinct families who opened their
 *                       payment page that week (squad_invite_audit_events
 *                       'payment_preview_opened'), the step before Shopify.
 *   Confirmed paid      distinct orders marked paid that week by the signed
 *                       Shopify orders/paid webhook (payment_state_events
 *                       to_status 'paid'). A later refund doesn't remove the
 *                       payment from its week; refunds are counted separately.
 *
 * Weeks run Monday to Sunday, UK time (Europe/London).
 */

export type ReportOrder = { id: string; source: string | null; created_at: string };
export type ReportPaymentEvent = { order_id: string | null; to_status: string; reason: string | null; created_at: string };
export type ReportSquadInviteEvent = { participation_id: string | null; event_type: string; created_at: string };

export type JourneyCounts = { orders: number; checkoutAttempts: number; paid: number; refunded: number };
export type WeekRow = { weekStart: string; direct: JourneyCounts; squadInvite: JourneyCounts };

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** The Monday (YYYY-MM-DD, UK date) of the week an instant falls in. */
export function londonWeekStart(iso: string | Date): string {
  const parts = Object.fromEntries(LONDON.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const monday = new Date(day - WEEKDAY_INDEX[parts.weekday] * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

const isSquadInvite = (source: string | null | undefined) => source === 'squad_invite';
const empty = (): JourneyCounts => ({ orders: 0, checkoutAttempts: 0, paid: 0, refunded: 0 });

export function buildWeeklyOrderReport(input: {
  orders: ReportOrder[];
  /** Source of every order referenced by an event (events can concern orders created earlier). */
  orderSources: Map<string, string | null>;
  paymentEvents: ReportPaymentEvent[];
  squadInviteEvents: ReportSquadInviteEvent[];
  now: Date;
  weeks: number;
}): WeekRow[] {
  const keys: string[] = [];
  const thisWeek = londonWeekStart(input.now);
  for (let i = 0; i < input.weeks; i++) {
    keys.push(new Date(Date.parse(`${thisWeek}T00:00:00Z`) - i * 7 * 86_400_000).toISOString().slice(0, 10));
  }
  const sets = new Map<string, Record<'direct' | 'squadInvite', Record<keyof JourneyCounts, Set<string>>>>();
  const bucket = (week: string) => {
    if (!keys.includes(week)) return null;
    if (!sets.has(week)) {
      const mk = () => ({ orders: new Set<string>(), checkoutAttempts: new Set<string>(), paid: new Set<string>(), refunded: new Set<string>() });
      sets.set(week, { direct: mk(), squadInvite: mk() });
    }
    return sets.get(week)!;
  };

  for (const o of input.orders) {
    const b = bucket(londonWeekStart(o.created_at));
    if (b) b[isSquadInvite(o.source) ? 'squadInvite' : 'direct'].orders.add(o.id);
  }
  for (const e of input.paymentEvents) {
    if (!e.order_id) continue;
    const b = bucket(londonWeekStart(e.created_at));
    if (!b) continue;
    const journey = isSquadInvite(input.orderSources.get(e.order_id)) ? 'squadInvite' : 'direct';
    if (journey === 'direct' && e.reason === 'checkout_initiated') b.direct.checkoutAttempts.add(e.order_id);
    if (e.to_status === 'paid') b[journey].paid.add(e.order_id);
    if (e.to_status === 'refunded') b[journey].refunded.add(e.order_id);
  }
  for (const e of input.squadInviteEvents) {
    if (!e.participation_id || e.event_type !== 'payment_preview_opened') continue;
    const b = bucket(londonWeekStart(e.created_at));
    if (b) b.squadInvite.checkoutAttempts.add(e.participation_id);
  }

  return keys.map((weekStart) => {
    const b = sets.get(weekStart);
    const count = (j: 'direct' | 'squadInvite'): JourneyCounts => (b
      ? { orders: b[j].orders.size, checkoutAttempts: b[j].checkoutAttempts.size, paid: b[j].paid.size, refunded: b[j].refunded.size }
      : empty());
    return { weekStart, direct: count('direct'), squadInvite: count('squadInvite') };
  });
}
