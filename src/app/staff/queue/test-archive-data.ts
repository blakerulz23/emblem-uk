import { createServiceRoleClient } from '@/lib/supabase/server';

export type TestArchiveCandidate = {
  id: string;
  shortRef: string;
  playerName: string;
  orderShortRef: string;
  orderStatus: string;
  cardStatus: string;
  productionStatus: string;
};

export type ArchivedTestCard = TestArchiveCandidate & { archivedAt: string; reason: string | null };

export type FinancialTestOrder = { id: string; shortRef: string; paymentStatus: string; hadShopifyOrder: boolean; visibleCards: number };

export type TestArchiveData = {
  candidates: TestArchiveCandidate[];
  archived: ArchivedTestCard[];
  financialOrders: FinancialTestOrder[];
};

const shortOrderRef = (ref: string | null | undefined) => ref?.split('-').pop() ?? ref ?? '—';

/** True when this staff member holds the test_data_admin permission (migration 0088). */
export async function hasTestDataAdmin(staffProfileId: string): Promise<boolean> {
  const { data } = await createServiceRoleClient()
    .from('squad_invite_staff_permissions')
    .select('staff_profile_id')
    .eq('staff_profile_id', staffProfileId)
    .eq('permission', 'test_data_admin')
    .is('revoked_at', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/**
 * Everything the "Internal test cards" panel shows. Read-only: which cards
 * could be archived (the database still decides), which are archived, and
 * which refunded or cancelled orders still have cards in the queues.
 */
export async function getTestArchiveData(): Promise<TestArchiveData> {
  const supabase = createServiceRoleClient();
  const { data: cards } = await supabase
    .from('cards')
    .select('id, order_id, status, production_status, archived_as_test_at, archive_reason, players ( name )')
    .is('production_dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (cards ?? []) as unknown as Array<{
    id: string; order_id: string | null; status: string; production_status: string;
    archived_as_test_at: string | null; archive_reason: string | null; players: { name: string } | null;
  }>;

  const orderIds = Array.from(new Set(rows.map((c) => c.order_id).filter((v): v is string => Boolean(v))));
  const { data: orders } = orderIds.length
    ? await supabase.from('orders').select('id, order_ref, payment_status, shopify_order_id, is_internal_test').in('id', orderIds)
    : { data: [] };
  const orderById = new Map((orders ?? []).map((o) => [o.id, o]));

  const toCandidate = (c: (typeof rows)[number]): TestArchiveCandidate => {
    const order = c.order_id ? orderById.get(c.order_id) : undefined;
    return {
      id: c.id,
      shortRef: c.id.slice(0, 8),
      playerName: c.players?.name ?? 'Player',
      orderShortRef: shortOrderRef(order?.order_ref),
      orderStatus: order?.payment_status ?? 'no order',
      cardStatus: c.status,
      productionStatus: c.production_status,
    };
  };

  const candidates = rows.filter((c) => !c.archived_as_test_at).map(toCandidate);
  const archived = rows
    .filter((c) => c.archived_as_test_at)
    .map((c) => ({ ...toCandidate(c), archivedAt: c.archived_as_test_at as string, reason: c.archive_reason }));

  const financialOrders: FinancialTestOrder[] = (orders ?? [])
    .filter((o) => (o.payment_status === 'refunded' || o.payment_status === 'cancelled') && !o.is_internal_test)
    .map((o) => ({
      id: o.id,
      shortRef: shortOrderRef(o.order_ref),
      paymentStatus: o.payment_status,
      hadShopifyOrder: Boolean(o.shopify_order_id),
      visibleCards: rows.filter((c) => c.order_id === o.id && !c.archived_as_test_at).length,
    }))
    .filter((o) => o.visibleCards > 0);

  return { candidates, archived, financialOrders };
}
