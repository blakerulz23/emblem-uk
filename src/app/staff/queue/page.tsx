import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SAMPLE_CARDS } from '../../card/[id]/sample-data';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { getSignedDownloadUrl } from '@/lib/s3-client';
import ApproveOrderButton from './ApproveOrderButton';
import ResendInviteButton from './ResendInviteButton';

// This reads live pending orders on every request — without this, Next
// would statically prerender the page at build time (its data fetch has
// no cookies()/searchParams call for Next to detect as dynamic on its
// own), freezing the queue at whatever orders existed at the last deploy.
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'var(--surface)', color: 'var(--ink-faint)', label: 'Self-serve' },
  pending_staff_review: { bg: '#fff7ed', color: '#c2410c', label: 'Needs staff setup' },
  published: { bg: '#ecfdf5', color: '#047857', label: 'Published' },
};

const INVITE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  sent: { bg: '#ecfdf5', color: '#047857', label: 'Invite sent' },
  failed: { bg: '#fef2f2', color: '#b91c1c', label: 'Invite email failed' },
  skipped_no_email: { bg: 'var(--surface)', color: 'var(--ink-faint)', label: 'No recipient email' },
};

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

async function getPendingOrders() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const supabase = createServiceRoleClient();
  let { data } = await supabase
    .from('orders')
    .select('id, order_ref, purchaser_email, payment_status, created_at, print_files')
    .in('payment_status', ['order_intent', 'pending_payment', 'paid'])
    .order('created_at', { ascending: false });

  // Until migration 0007 runs, the print_files column doesn't exist and the
  // select above errors out (returns null data). Fall back to the original
  // column list so the queue keeps working.
  if (!data) {
    const fallback = await supabase
      .from('orders')
      .select('id, order_ref, purchaser_email, payment_status, created_at')
      .in('payment_status', ['order_intent', 'pending_payment', 'paid'])
      .order('created_at', { ascending: false });
    data = (fallback.data ?? []).map((o) => ({ ...o, print_files: null }));
  }

  const cardCounts = await getCardCountsByOrder(
    supabase,
    (data ?? []).map((o) => o.id)
  );

  type PrintFileRef = { playerId?: string | null; playerName?: string | null; key: string };
  // Presigned URLs expire (SigV4 max 7 days) — re-sign from the stored S3
  // keys on every page load so the download links always work.
  return Promise.all(
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
      return { ...order, printFiles, cardCount: cardCounts.get(order.id) ?? 0 };
    })
  );
}

/**
 * Single-card orders staff have already approved, most recent first — this
 * is where the post-approval invitation's delivery status/resend action
 * lives, since fulfilled orders drop off the pending list above.
 * Multi-player orders are excluded: Phase 1 doesn't trigger any invitation
 * for them (see the staff-queue gaps plan) — showing them here with no
 * status would read as a bug rather than the deliberate Phase 2 deferral
 * it is.
 */
async function getRecentlyApprovedSingleCardOrders() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  const supabase = createServiceRoleClient();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_ref, purchaser_email, intended_guardian_email, approved_at')
    .eq('payment_status', 'fulfilled')
    .order('approved_at', { ascending: false })
    .limit(50);

  if (!orders || orders.length === 0) return [];

  const cardCounts = await getCardCountsByOrder(
    supabase,
    orders.map((o) => o.id)
  );
  const singleCardOrders = orders.filter((o) => (cardCounts.get(o.id) ?? 0) === 1).slice(0, 20);
  if (singleCardOrders.length === 0) return [];

  const { data: invites } = await supabase
    .from('player_invites')
    .select('order_id, email_status, email_sent_at')
    .eq('origin', 'order_approval')
    .in(
      'order_id',
      singleCardOrders.map((o) => o.id)
    );

  const inviteByOrder = new Map<string, { email_status: string | null; email_sent_at: string | null }>();
  for (const invite of invites ?? []) {
    if (invite.order_id) inviteByOrder.set(invite.order_id, invite);
  }

  return singleCardOrders.map((order) => ({ ...order, invite: inviteByOrder.get(order.id) ?? null }));
}

export default async function StaffQueuePage() {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/queue');
  }

  const cards = Object.values(SAMPLE_CARDS);
  const pendingOrders = await getPendingOrders();
  const approvedOrders = await getRecentlyApprovedSingleCardOrders();

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

      <div style={{ marginTop: 28, display: 'grid', gap: 12 }}>
        {pendingOrders.length === 0 && (
          <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
            Nothing waiting on approval right now.
          </p>
        )}
        {pendingOrders.map((order) => (
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
            <ApproveOrderButton orderId={order.id} />
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

      <div style={{ marginTop: 28, display: 'grid', gap: 12 }}>
        {approvedOrders.length === 0 && (
          <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-faint)' }}>
            No approved single-card orders yet.
          </p>
        )}
        {approvedOrders.map((order) => {
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

      <h2
        style={{
          fontFamily: 'var(--font-sora), system-ui', fontWeight: 800,
          fontSize: 22, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '40px 0 6px',
        }}
      >
        Profile setup queue
      </h2>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: 0 }}>
        Orders where the customer chose &ldquo;Let Emblem build my profile&rdquo; show up here until a staff member sets them up and verifies the chip.
      </p>

      <div style={{ marginTop: 28, display: 'grid', gap: 12 }}>
        {cards.map((c) => {
          const s = STATUS_STYLE[c.status];
          return (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 18px', borderRadius: 16,
                background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                  {c.name} <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>· {c.subtitle}</span>
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 999, background: s.bg, color: s.color,
                    }}
                  >
                    {s.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-jbmono), monospace', fontSize: 12,
                      color: c.chipProgrammed ? '#047857' : '#c2410c',
                    }}
                  >
                    {c.chipProgrammed ? '✓ chip programmed' : '✗ chip not programmed'}
                  </span>
                </div>
              </div>
              <Link
                href={`/card/${c.id}`}
                style={{
                  fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 13,
                  color: '#fff', background: 'var(--ink)', padding: '10px 16px', borderRadius: 10,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                {c.status === 'pending_staff_review' ? 'Build profile →' : 'View profile →'}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
