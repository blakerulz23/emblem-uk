import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import { buildNfcCardUrl } from '@/lib/nfc-link';
import {
  APPROVED_SORT_OPTIONS,
  buildStaffQueueUrl,
  compareApprovedRows,
  compareQueueRows,
  matchesAnyField,
  normalizePlayerSearch,
  paginate,
  parseApprovedSort,
  parseQueueSort,
  QUEUE_SORT_OPTIONS,
  type ApprovedSort,
  type QueueSort,
} from '@/lib/staff-queue-search';
import ApproveOrderButton from './ApproveOrderButton';
import ApproveTeamOrderButton from './ApproveTeamOrderButton';
import ResendInviteButton from './ResendInviteButton';
import BuildProfileButton from './BuildProfileButton';
import RejectCardButton from './RejectCardButton';
import DeleteCardButton from './DeleteCardButton';
import CopyLinkButton from './CopyLinkButton';
import SectionSearchControls from './SectionSearchControls';
import SectionSearchEmptyState from './SectionSearchEmptyState';

// This reads live pending orders on every request — without this, Next
// would statically prerender the page at build time (its data fetch has
// no cookies()/searchParams call for Next to detect as dynamic on its
// own), freezing the queue at whatever orders existed at the last deploy.
export const dynamic = 'force-dynamic';

const PRODUCTION_STATUS_LABEL: Record<string, { bg: string; color: string; label: string }> = {
  needs_setup: { bg: 'var(--surface)', color: 'var(--ink-faint)', label: 'Needs setup' },
  ready_for_programming: { bg: '#fff7ed', color: '#c2410c', label: 'Ready for programming' },
  programmed: { bg: '#eff6ff', color: '#1d4ed8', label: 'Programmed' },
  verified: { bg: '#f5f3ff', color: '#6d28d9', label: 'Verified' },
  completed: { bg: '#ecfdf5', color: '#047857', label: 'Completed' },
};

const PUBLISHED_BADGE: Record<'published' | 'unpublished', { bg: string; color: string; label: string }> = {
  published: { bg: '#ecfdf5', color: '#047857', label: 'Published' },
  unpublished: { bg: 'var(--surface)', color: 'var(--ink-faint)', label: 'Unpublished' },
};

const INVITE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  sent: { bg: '#ecfdf5', color: '#047857', label: 'Invite sent' },
  failed: { bg: '#fef2f2', color: '#b91c1c', label: 'Invite email failed' },
  skipped_no_email: { bg: 'var(--surface)', color: 'var(--ink-faint)', label: 'No recipient email' },
};

const APPROVED_PAGE_SIZE = 20;

/** How many cards with a player_id are linked to each of these orders — the
 * ground truth for "single-card vs. squad," since `orders.source` no longer
 * reflects it (every live order is recorded as 'team_order', one card or
 * many; see the approve route's doc comment for the full reasoning). */
async function getCardCountsByOrder(supabase: ReturnType<typeof createServiceRoleClient>, orderIds: string[]) {
  const counts = new Map<string, number>();
  if (orderIds.length === 0) return counts;
  const { data } = await supabase.from('cards').select('order_id').in('order_id', orderIds).not('player_id', 'is', null);
  for (const row of data ?? []) {
    if (!row.order_id) continue;
    counts.set(row.order_id, (counts.get(row.order_id) ?? 0) + 1);
  }
  return counts;
}

/** Every real player name linked to each order (via cards.player_id ->
 * players.name) — cards/players are created at order-submission time
 * (see api/order-enquiry), before staff ever approve, so this is available
 * for both the Awaiting Approval and Recently Approved sections. A squad
 * order can have several; search matches if ANY of them do. */
async function getPlayerNamesByOrder(supabase: ReturnType<typeof createServiceRoleClient>, orderIds: string[]) {
  const map = new Map<string, string[]>();
  if (orderIds.length === 0) return map;
  const { data } = await supabase
    .from('cards')
    .select('order_id, players ( name )')
    .in('order_id', orderIds)
    .not('player_id', 'is', null);
  type Row = { order_id: string; players: { name: string } | null };
  for (const row of (data ?? []) as unknown as Row[]) {
    const name = row.players?.name?.trim();
    if (!name) continue;
    const list = map.get(row.order_id) ?? [];
    list.push(name);
    map.set(row.order_id, list);
  }
  return map;
}

/** The alphabetically-first linked player name — the deterministic
 * "representative name" an order sorts by under Player name A–Z/Z–A, since
 * a squad order can have several players and sorting needs exactly one
 * value per row. Both name_asc and name_desc use this same pick, so Z–A is
 * a true reverse of A–Z rather than a different representative. */
function representativeName(names: string[]): string {
  if (names.length === 0) return '';
  return names.slice().sort((a, b) => a.localeCompare(b))[0];
}

type PrintFileRef = { playerId?: string | null; playerName?: string | null; key: string };

/**
 * Section 1 — orders not yet approved. No display cap exists for this
 * section (never has), so it isn't paginated — approvalQ/approvalSort
 * filter and sort the full set server-side.
 */
async function getPendingOrders(approvalQ: string, approvalSort: QueueSort) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { orders: [], total: 0 };
  const supabase = createServiceRoleClient();
  let { data } = await supabase
    .from('orders')
    .select('id, order_ref, purchaser_email, payment_status, created_at, print_files, club_name, team_name')
    .in('payment_status', ['order_intent', 'pending_payment', 'paid']);

  // Until migrations 0007 (print_files) / 0009 (club_name/team_name) run,
  // those columns don't exist and the select above errors out (returns
  // null data). Fall back to the original column list so the queue keeps
  // working.
  if (!data) {
    const fallback = await supabase
      .from('orders')
      .select('id, order_ref, purchaser_email, payment_status, created_at')
      .in('payment_status', ['order_intent', 'pending_payment', 'paid']);
    data = (fallback.data ?? []).map((o) => ({ ...o, print_files: null, club_name: null, team_name: null }));
  }

  const orderIds = (data ?? []).map((o) => o.id);
  const cardCounts = await getCardCountsByOrder(supabase, orderIds);
  const playerNamesByOrder = await getPlayerNamesByOrder(supabase, orderIds);

  // Presigned URLs expire (SigV4 max 7 days) — re-sign from the stored S3
  // keys on every page load so the download links always work.
  const withPrintFiles = await Promise.all(
    (data ?? []).map(async (order) => {
      const refs = Array.isArray(order.print_files) ? (order.print_files as PrintFileRef[]) : [];
      const printFiles = await Promise.all(
        refs
          .filter((f) => typeof f?.key === 'string')
          .map(async (f) => ({
            playerName: f.playerName ?? 'Player',
            url: await getSignedDownloadUrl(f.key, 3600),
          }))
      );
      return {
        ...order,
        printFiles,
        cardCount: cardCounts.get(order.id) ?? 0,
        playerNames: playerNamesByOrder.get(order.id) ?? [],
      };
    })
  );

  const normalizedQuery = normalizePlayerSearch(approvalQ);
  const matching = normalizedQuery
    ? withPrintFiles.filter((o) =>
        matchesAnyField([o.order_ref, o.purchaser_email, o.club_name, o.team_name, ...o.playerNames], normalizedQuery)
      )
    : withPrintFiles;

  const sorted = matching
    .slice()
    .sort((a, b) => compareQueueRows(a, b, approvalSort, (r) => r.created_at, (r) => representativeName(r.playerNames)));

  return { orders: sorted, total: sorted.length };
}

/**
 * Section 2 — single-card orders staff have already approved, most recent
 * first — this is where the post-approval invitation's delivery status/
 * resend action lives, since fulfilled orders drop off the pending list
 * above. Multi-player orders are excluded: Phase 1 doesn't trigger any
 * invitation for them (see the staff-queue gaps plan) — showing them here
 * with no status would read as a bug rather than the deliberate Phase 2
 * deferral it is.
 *
 * The existing "last 20 approved" cap only applies when approvedQ is empty
 * — search must cover every eligible (fulfilled, single-card) record, not
 * just the most recent 20, so it fetches the full eligible set and
 * paginates over the real matching total instead.
 */
async function getRecentlyApprovedSingleCardOrders(approvedQ: string, approvedSort: ApprovedSort, approvedPage: number) {
  const empty = { orders: [], total: 0, page: 1, pageSize: APPROVED_PAGE_SIZE, totalPages: 1 };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return empty;
  const supabase = createServiceRoleClient();
  const hasSearch = normalizePlayerSearch(approvedQ).length > 0;

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_ref, purchaser_email, intended_guardian_email, approved_at, club_name, team_name')
    .eq('payment_status', 'fulfilled')
    .order('approved_at', { ascending: false })
    // Not-searching keeps today's existing raw-fetch size (bounded, cheap);
    // searching needs the full eligible universe to search across, bounded
    // generously here only as a defensive ceiling, not a functional limit.
    .limit(hasSearch ? 2000 : 50);

  if (!orders || orders.length === 0) return empty;

  const cardCounts = await getCardCountsByOrder(supabase, orders.map((o) => o.id));
  const singleCardOrders = orders.filter((o) => (cardCounts.get(o.id) ?? 0) === 1);
  if (singleCardOrders.length === 0) return empty;

  const playerNamesByOrder = await getPlayerNamesByOrder(
    supabase,
    singleCardOrders.map((o) => o.id)
  );

  const normalizedQuery = normalizePlayerSearch(approvedQ);
  const matching = normalizedQuery
    ? singleCardOrders.filter((o) =>
        matchesAnyField(
          [o.order_ref, o.purchaser_email, o.intended_guardian_email, o.club_name, o.team_name, ...(playerNamesByOrder.get(o.id) ?? [])],
          normalizedQuery
        )
      )
    : singleCardOrders;

  const sorted = matching
    .slice()
    .sort((a, b) => compareApprovedRows(a, b, approvedSort, (r) => r.approved_at, (r) => representativeName(playerNamesByOrder.get(r.id) ?? [])));

  const page = hasSearch
    ? paginate(sorted, approvedPage, APPROVED_PAGE_SIZE)
    : { items: sorted.slice(0, APPROVED_PAGE_SIZE), total: sorted.length, page: 1, pageSize: APPROVED_PAGE_SIZE, totalPages: 1 };

  if (page.items.length === 0) return { orders: [], total: page.total, page: page.page, pageSize: page.pageSize, totalPages: page.totalPages };

  const { data: invites } = await supabase
    .from('player_invites')
    .select('order_id, email_status, email_sent_at')
    .eq('origin', 'order_approval')
    .in(
      'order_id',
      page.items.map((o) => o.id)
    );

  const inviteByOrder = new Map<string, { email_status: string | null; email_sent_at: string | null }>();
  for (const invite of invites ?? []) {
    if (invite.order_id) inviteByOrder.set(invite.order_id, invite);
  }

  return {
    orders: page.items.map((order) => ({ ...order, invite: inviteByOrder.get(order.id) ?? null })),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  };
}

/**
 * Section 3 — the real "Profile Setup Queue," one item per physical card
 * (cards row), not per order or per abstract player, since a card is the
 * actual unit that carries a claim_token/NFC destination and can be in its
 * own independent production stage even within a squad order. Scoped to
 * cards linked to a fulfilled order — cards created outside the queue
 * entirely (e.g. a coach's "+Add Player") never had a physical print step
 * to track, so they're excluded here.
 *
 * Flat per-card lists (each row already shows its own club/team label and
 * order ref inline) rather than grouped by order — "newest first" is
 * defined per queue item, not per order/group. No display cap exists for
 * this section (never has), so its existing search-and-sort controls stay
 * unpaginated, extended only to search club/team and order reference too.
 */
async function getProductionQueueCards(setupQ: string, setupSort: QueueSort) {
  const empty = { waiting: [], submitted: [], waitingCount: 0, submittedCount: 0 };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return empty;
  const supabase = createServiceRoleClient();

  const { data: fulfilledOrders } = await supabase
    .from('orders')
    .select('id, order_ref, purchaser_email, print_files')
    .eq('payment_status', 'fulfilled');
  if (!fulfilledOrders?.length) return empty;
  const orderById = new Map(fulfilledOrders.map((o) => [o.id, o]));

  const { data: cardRows } = await supabase
    .from('cards')
    .select(
      `id, order_id, claim_token, production_status, production_submitted_at, created_at, player_id,
       players ( name, public_player_id, public_id_enabled, teams ( clubs ( name ) ) ),
       card_definitions ( team )`
    )
    .in(
      'order_id',
      fulfilledOrders.map((o) => o.id)
    )
    .not('player_id', 'is', null)
    .is('production_dismissed_at', null);

  type CardRow = {
    id: string;
    order_id: string;
    claim_token: string;
    production_status: string;
    production_submitted_at: string | null;
    created_at: string;
    player_id: string;
    players: { name: string; public_player_id: string | null; public_id_enabled: boolean; teams: { clubs: { name: string } | null } | null } | null;
    card_definitions: { team: string } | null;
  };

  // Two same-named "Jacob Thompson" test rows in this exact dataset proved
  // player name alone isn't a safe row identifier for staff — every row
  // also carries purchaser email + short order/card refs + the claim
  // token itself, so a row can always be disambiguated without ever
  // showing a full UUID.
  const rows = await Promise.all(
    ((cardRows ?? []) as unknown as CardRow[]).map(async (c) => {
      const order = orderById.get(c.order_id);
      const shortOrderRef = order?.order_ref?.split('-').pop() ?? order?.order_ref ?? '—';
      // Same print_files relationship Section 1 already reads, re-signed
      // fresh (presigned S3 URLs expire) — matched to this exact card's
      // player, not just its order, since a print PDF is per-player.
      // Matched by name, not playerId — print_files.playerId is a
      // client-side Builder draft id captured before the real players
      // row exists, so it never actually equals cards.player_id /
      // players.id (confirmed against live data: every real order's
      // print_files playerId is a different value than its player's
      // real id). playerName is populated from the same submission and
      // reliably corresponds.
      const playerName = c.players?.name?.trim();
      const printRefs = Array.isArray(order?.print_files) ? (order!.print_files as PrintFileRef[]) : [];
      const printRef = printRefs.find((f) => f.playerName?.trim() === playerName && typeof f.key === 'string');
      const printUrl = printRef ? await getSignedDownloadUrl(printRef.key, 3600) : null;
      return {
        id: c.id,
        orderId: c.order_id,
        orderRef: order?.order_ref ?? '',
        shortCardRef: c.id.slice(0, 8),
        claimToken: c.claim_token,
        purchaserEmail: order?.purchaser_email ?? '—',
        shortOrderRef,
        productionStatus: c.production_status,
        productionSubmittedAt: c.production_submitted_at,
        createdAt: c.created_at,
        playerName: c.players?.name ?? 'Player',
        // card_definitions.team is the frozen design-time club label; falls
        // back to the player's live club via team_id when no card artwork
        // was ever produced for this card (see the "no artwork" cases below).
        clubTeamLabel: c.card_definitions?.team ?? c.players?.teams?.clubs?.name ?? null,
        hasArtwork: !!c.card_definitions,
        printUrl,
        publicPlayerId: c.players?.public_player_id ?? null,
        publicIdEnabled: c.players?.public_id_enabled ?? false,
      };
    })
  );

  const normalizedQuery = normalizePlayerSearch(setupQ);
  const matching = normalizedQuery
    ? rows.filter((r) => matchesAnyField([r.playerName, r.clubTeamLabel, r.orderRef], normalizedQuery))
    : rows;

  const waitingCards = matching.filter((c) => c.productionStatus === 'needs_setup');
  const submittedCards = matching.filter((c) => c.productionStatus !== 'needs_setup');

  const waitingSorted = waitingCards
    .slice()
    .sort((a, b) => compareQueueRows(a, b, setupSort, (r) => r.createdAt, (r) => r.playerName));
  const submittedSorted = submittedCards
    .slice()
    .sort((a, b) => compareQueueRows(a, b, setupSort, (r) => r.productionSubmittedAt, (r) => r.playerName));

  return {
    waiting: waitingSorted,
    submitted: submittedSorted,
    waitingCount: waitingSorted.length,
    submittedCount: submittedSorted.length,
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resultsLabel(total: number, q: string) {
  return `${total === 1 ? '1 result' : `${total} results`} for ‘${q}’`;
}

export default async function StaffQueuePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/queue');
  }

  const fullParams = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const v = firstParam(value);
    if (v) fullParams.set(key, v);
  }

  const approvalQ = (firstParam(searchParams?.approvalQ) ?? '').trim();
  const approvalSort = parseQueueSort(firstParam(searchParams?.approvalSort));
  const hasApprovalSearch = approvalQ.length > 0;

  const approvedQ = (firstParam(searchParams?.approvedQ) ?? '').trim();
  const approvedSort = parseApprovedSort(firstParam(searchParams?.approvedSort));
  const approvedPageParam = Number(firstParam(searchParams?.approvedPage)) || 1;
  const hasApprovedSearch = approvedQ.length > 0;

  const setupQ = (firstParam(searchParams?.setupQ) ?? '').trim();
  const setupSort = parseQueueSort(firstParam(searchParams?.setupSort));
  const hasSetupSearch = setupQ.length > 0;

  const pending = await getPendingOrders(approvalQ, approvalSort);
  const approved = await getRecentlyApprovedSingleCardOrders(approvedQ, approvedSort, approvedPageParam);
  const productionQueue = await getProductionQueueCards(setupQ, setupSort);
  const totalSetupResults = productionQueue.waitingCount + productionQueue.submittedCount;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14">
      <span
        style={{
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'var(--accent-tint)',
          padding: '6px 12px', borderRadius: 999, display: 'inline-block',
        }}
      >
        Internal · Staff only
      </span>

      <h1
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px',
        }}
      >
        Emblem OS orders awaiting approval
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
        A cart redirect or submitted enquiry isn&rsquo;t proof of purchase — approving here is what makes an order&rsquo;s claim code(s) actually claimable by a parent. Orders with exactly one card also send the customer an invitation email once approved; multi-player orders do not yet (see below).
      </p>

      <SectionSearchControls
        paramPrefix="approval"
        placeholder="Search player, email or order"
        searchAriaLabel="Search orders awaiting approval by player, email or order reference"
        initialQuery={approvalQ}
        initialSort={approvalSort}
        defaultSort="newest"
        sortOptions={QUEUE_SORT_OPTIONS}
      />
      {hasApprovalSearch && (
        <p aria-live="polite" style={{ margin: '2px 0 0', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          {resultsLabel(pending.total, approvalQ)}
        </p>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {pending.orders.length === 0 &&
          (hasApprovalSearch ? (
            <SectionSearchEmptyState paramPrefix="approval" heading="No matching orders awaiting approval." />
          ) : (
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
              Nothing waiting on approval right now.
            </p>
          ))}
        {pending.orders.map((order) => (
          <div
            key={order.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 18px', borderRadius: 16,
              background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                {order.order_ref} <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>· {order.cardCount === 1 ? 'Single card' : order.cardCount === 0 ? 'No player yet' : `Team order (${order.cardCount} players)`}</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: 'var(--ink-soft)' }}>
                {order.purchaser_email} · {order.payment_status}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {order.printFiles.length > 0 ? (
                  order.printFiles.map((f, i) => (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600,
                        color: 'var(--accent)', textDecoration: 'none',
                        padding: '4px 10px', borderRadius: 999,
                        background: 'var(--accent-tint)',
                      }}
                    >
                      ⬇ {f.playerName} print PDF
                    </a>
                  ))
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: '#b91c1c', background: '#fef2f2',
                      padding: '4px 10px', borderRadius: 999,
                    }}
                  >
                    Print file missing
                  </span>
                )}
              </div>
            </div>
            {order.cardCount > 1 ? (
              <ApproveTeamOrderButton
                orderId={order.id}
                purchaserEmail={order.purchaser_email}
                clubNameHint={order.club_name}
                teamNameHint={order.team_name}
              />
            ) : (
              <ApproveOrderButton orderId={order.id} />
            )}
          </div>
        ))}
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 22, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '40px 0 6px',
        }}
      >
        Recently approved — single-card orders
      </h2>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
        Invitation delivery status for the last 20 approved orders with exactly one card. Multi-player orders aren&rsquo;t shown here — they don&rsquo;t get an automatic customer invitation yet.
      </p>

      <SectionSearchControls
        paramPrefix="approved"
        placeholder="Search player, email or order"
        searchAriaLabel="Search recently approved orders by player, email or order reference"
        initialQuery={approvedQ}
        initialSort={approvedSort}
        defaultSort="approved-desc"
        sortOptions={APPROVED_SORT_OPTIONS}
      />
      {hasApprovedSearch && (
        <p aria-live="polite" style={{ margin: '2px 0 0', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)' }}>
          {resultsLabel(approved.total, approvedQ)}
        </p>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {approved.orders.length === 0 &&
          (hasApprovedSearch ? (
            <SectionSearchEmptyState paramPrefix="approved" heading="No matching approved orders." />
          ) : (
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
              No approved single-card orders yet.
            </p>
          ))}
        {approved.orders.map((order) => {
          const badge = order.invite?.email_status ? INVITE_BADGE[order.invite.email_status] : null;
          const recipient = order.intended_guardian_email || order.purchaser_email;
          return (
            <div
              key={order.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 18px', borderRadius: 16,
                background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                  {order.order_ref}
                </div>
                <div style={{ marginTop: 4, fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: 'var(--ink-soft)' }}>
                  {recipient}
                </div>
                {badge && (
                  <span
                    style={{
                      display: 'inline-block', marginTop: 8,
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 999,
                      background: badge.bg, color: badge.color,
                    }}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
              <ResendInviteButton orderId={order.id} />
            </div>
          );
        })}
      </div>

      {approved.totalPages > 1 && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Link
            href={buildStaffQueueUrl(fullParams, { approvedPage: approved.page <= 2 ? null : String(approved.page - 1) })}
            aria-disabled={approved.page <= 1}
            style={{
              pointerEvents: approved.page <= 1 ? 'none' : 'auto', opacity: approved.page <= 1 ? 0.4 : 1,
              fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
              color: 'var(--ink)', background: 'var(--surface)',
              padding: '9px 16px', borderRadius: 10, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center',
            }}
          >
            Previous
          </Link>
          <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)' }}>
            Page {approved.page} of {approved.totalPages}
          </span>
          <Link
            href={buildStaffQueueUrl(fullParams, { approvedPage: String(approved.page + 1) })}
            aria-disabled={approved.page >= approved.totalPages}
            style={{
              pointerEvents: approved.page >= approved.totalPages ? 'none' : 'auto', opacity: approved.page >= approved.totalPages ? 0.4 : 1,
              fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
              color: 'var(--ink)', background: 'var(--surface)',
              padding: '9px 16px', borderRadius: 10, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center',
            }}
          >
            Next
          </Link>
        </div>
      )}

      <h2
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 22, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '40px 0 6px',
        }}
      >
        Profile Setup Queue
      </h2>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
        Approved cards waiting for NFC programming. Open or copy the browser link to verify the correct Player OS, public profile and guardian behaviour before writing a physical chip.
      </p>

      <SectionSearchControls
        paramPrefix="setup"
        placeholder="Search player name"
        searchAriaLabel="Search the setup queue by player, club or order reference"
        initialQuery={setupQ}
        initialSort={setupSort}
        defaultSort="newest"
        sortOptions={QUEUE_SORT_OPTIONS}
      />

      {hasSetupSearch && (
        <p
          aria-live="polite"
          style={{ margin: '2px 0 0', fontFamily: 'var(--font-jbmono), monospace', fontSize: 12.5, color: 'var(--ink-soft)' }}
        >
          {resultsLabel(totalSetupResults, setupQ)}
        </p>
      )}

      <h3
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700,
          fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase',
          color: 'var(--ink-faint)', margin: '28px 0 6px',
        }}
      >
        Waiting for Setup ({productionQueue.waitingCount})
      </h3>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {productionQueue.waiting.length === 0 &&
          (hasSetupSearch ? (
            <SectionSearchEmptyState paramPrefix="setup" heading="No matching players in the setup queue." />
          ) : (
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
              Nothing waiting on setup right now.
            </p>
          ))}
        {productionQueue.waiting.map((c) => {
          const nfcUrl = buildNfcCardUrl(c.claimToken);
          return (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                padding: '16px 18px', borderRadius: 16,
                background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                  {c.playerName}
                  {c.clubTeamLabel && <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}> · {c.clubTeamLabel}</span>}
                </div>
                <div style={{ marginTop: 4, fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: 'var(--ink-soft)' }}>
                  {c.purchaserEmail} · order {c.shortOrderRef} · card {c.shortCardRef} · {c.claimToken}
                </div>
                {!c.hasArtwork && (
                  <div style={{ marginTop: 4, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                    No card artwork on file
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {c.printUrl && (
                  <a
                    href={c.printUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
                      color: 'var(--ink)', background: 'var(--surface)',
                      padding: '8px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    Print PDF
                  </a>
                )}
                <a
                  href={nfcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
                    color: 'var(--ink)', background: 'var(--surface)',
                    padding: '8px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  Open NFC Link
                </a>
                <CopyLinkButton url={nfcUrl} label="Copy NFC" />
                <BuildProfileButton cardId={c.id} />
              </div>
            </div>
          );
        })}
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 700,
          fontSize: 15, letterSpacing: '0.02em', textTransform: 'uppercase',
          color: 'var(--ink-faint)', margin: '32px 0 6px',
        }}
      >
        Ready for Programming ({productionQueue.submittedCount})
      </h3>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {productionQueue.submitted.length === 0 &&
          (hasSetupSearch ? (
            <SectionSearchEmptyState paramPrefix="setup" heading="No matching players in the setup queue." />
          ) : (
            <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
              Nothing submitted to production yet.
            </p>
          ))}
        {productionQueue.submitted.map((c) => {
          const nfcUrl = buildNfcCardUrl(c.claimToken);
          const statusBadge = PRODUCTION_STATUS_LABEL[c.productionStatus] ?? PRODUCTION_STATUS_LABEL.needs_setup;
          const publishedBadge = c.publicIdEnabled ? PUBLISHED_BADGE.published : PUBLISHED_BADGE.unpublished;
          return (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                padding: '16px 18px', borderRadius: 16,
                background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                  {c.playerName}
                  {c.clubTeamLabel && <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}> · {c.clubTeamLabel}</span>}
                </div>
                <div style={{ marginTop: 4, fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, color: 'var(--ink-soft)' }}>
                  {c.purchaserEmail} · order {c.shortOrderRef} · card {c.shortCardRef} · {c.claimToken}
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 999, background: publishedBadge.bg, color: publishedBadge.color,
                    }}
                  >
                    {publishedBadge.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 999, background: statusBadge.bg, color: statusBadge.color,
                    }}
                  >
                    {statusBadge.label}
                  </span>
                  {!c.hasArtwork && (
                    <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 11.5, color: 'var(--ink-faint)' }}>
                      No card artwork on file
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {c.printUrl && (
                  <a
                    href={c.printUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
                      color: 'var(--ink)', background: 'var(--surface)',
                      padding: '8px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    Print PDF
                  </a>
                )}
                {c.publicIdEnabled && c.publicPlayerId && (
                  <a
                    href={`/player/${c.publicPlayerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
                      color: 'var(--ink)', background: 'var(--surface)',
                      padding: '8px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    Open Profile
                  </a>
                )}
                <a
                  href={nfcUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 12.5,
                    color: 'var(--ink)', background: 'var(--surface)',
                    padding: '8px 14px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  Open NFC Link
                </a>
                <CopyLinkButton url={nfcUrl} label="Copy NFC" />
                <RejectCardButton cardId={c.id} playerName={c.playerName} />
                <DeleteCardButton cardId={c.id} playerName={c.playerName} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
