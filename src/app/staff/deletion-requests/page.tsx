import { redirect } from 'next/navigation';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import MarkCompletedButton from './MarkCompletedButton';
import RejectButton from './RejectButton';

export const dynamic = 'force-dynamic';

/**
 * The operational home for "Request player-data deletion" (Account
 * Settings) — a plain authenticated staff queue, not an email
 * notification (no reliable staff/admin recipient address exists
 * anywhere in this codebase's config; see the audit report). A pending
 * row here is the entire signal staff have that a deletion needs doing.
 *
 * Migration 0076: "Confirm erasure" (MarkCompletedButton) now performs
 * real, server-enforced erasure — database records, cards, and stored
 * media — not merely an attestation that a human carried out the old
 * manual runbook elsewhere.
 */
// Explicit fixed timeZone — without it, toLocaleString()'s output depends
// on the runtime's local timezone, which differs between this Server
// Component's render (server, likely UTC) and the client's own hydration
// pass, producing a real "text content does not match server-rendered
// HTML" error (confirmed in staging testing, not theoretical). Staff can
// be in any timezone, so a fixed UTC display is also the more correct
// choice here, not just the hydration-safe one.
function formatRequestedAt(iso: string, withTime: boolean) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

type RequestRow = {
  id: string;
  // Nullable since migration 0076: player_id -> players.id is now SET NULL
  // on delete, not CASCADE — a request whose erasure already ran (even
  // before status flips to 'completed') has player_id null the moment the
  // player row is gone, since the request row is deliberately kept as the
  // erasure's own audit trail.
  player_id: string | null;
  requester_email: string | null;
  requested_at: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  completion_note: string | null;
  handled_at: string | null;
  rejection_reason: string | null;
  cancelled_at: string | null;
  players: { name: string } | null;
  completed_by_profile: { display_name: string | null } | null;
  handled_by_profile: { display_name: string | null } | null;
};

export default async function StaffDeletionRequestsPage() {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    redirect('/staff/login?next=/staff/deletion-requests');
  }

  const serviceRole = createServiceRoleClient();
  const { data: pendingRows } = await serviceRole
    .from('player_deletion_requests')
    .select('id, player_id, requester_email, requested_at, status, notes, players ( name )')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  const { data: completedRowsRaw } = await serviceRole
    .from('player_deletion_requests')
    .select('id, player_id, requester_email, requested_at, status, notes, completed_by, completed_at, completion_note, players ( name )')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(20);
  // History: rejected and cancelled requests shown together, most-recent
  // first — staff need to see these happened, not just completions,
  // per "keep rejected/cancelled distinct from completed" (0041).
  const { data: historyRowsRaw } = await serviceRole
    .from('player_deletion_requests')
    .select('id, player_id, requester_email, requested_at, status, notes, handled_by, handled_at, rejection_reason, cancelled_at, players ( name )')
    .in('status', ['rejected', 'cancelled'])
    .order('requested_at', { ascending: false })
    .limit(20);

  const pending = (pendingRows ?? []) as unknown as RequestRow[];
  // Two-step fetch rather than an embedded join on completed_by/handled_by
  // — avoids depending on Postgres's auto-generated FK constraint name for
  // the embed syntax, which isn't worth the fragility for a 20-row admin list.
  const completedRaw = (completedRowsRaw ?? []) as unknown as Array<Omit<RequestRow, 'completed_by_profile' | 'handled_by_profile'> & { completed_by: string | null }>;
  const historyRaw = (historyRowsRaw ?? []) as unknown as Array<Omit<RequestRow, 'completed_by_profile' | 'handled_by_profile'> & { handled_by: string | null }>;
  const staffIds = Array.from(
    new Set([
      ...completedRaw.map((r) => r.completed_by).filter((v): v is string => !!v),
      ...historyRaw.map((r) => r.handled_by).filter((v): v is string => !!v),
    ])
  );
  const { data: staffProfiles } = staffIds.length
    ? await serviceRole.from('profiles').select('id, display_name').in('id', staffIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const staffNameById = new Map((staffProfiles ?? []).map((p) => [p.id, p.display_name]));
  const completed: RequestRow[] = completedRaw.map((r) => ({
    ...r,
    completed_by_profile: r.completed_by ? { display_name: staffNameById.get(r.completed_by) ?? null } : null,
    handled_by_profile: null,
  }));
  const history: RequestRow[] = historyRaw.map((r) => ({
    ...r,
    completed_by_profile: null,
    handled_by_profile: r.handled_by ? { display_name: staffNameById.get(r.handled_by) ?? null } : null,
  }));

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

      <h1 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px' }}>
        Player-data deletion requests
      </h1>
      <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
        A guardian has asked for a player&rsquo;s profile, moments and photos to be permanently removed. Verify the request, then
        confirm erasure below — this deletes the player&rsquo;s data, revokes their cards, and removes stored media for real. After
        confirming, reply to the guardian&rsquo;s email confirming what was removed.
      </p>

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        Pending ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>Nothing pending.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>
                  {r.players?.name ?? '(player not found)'}
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                  Requested {formatRequestedAt(r.requested_at, true)} UTC{r.player_id ? ` · player ${r.player_id.slice(0, 8)}…` : ' · erasure already ran — finishing storage cleanup'}
                </div>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                  Contact: {r.requester_email ?? '(no email on file)'}
                </div>
                {r.notes && <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>{r.notes}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <MarkCompletedButton requestId={r.id} />
                <RejectButton requestId={r.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        Recently completed
      </h2>
      {completed.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {completed.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                {r.players?.name ?? '(player not found)'}
              </div>
              <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                Requested {formatRequestedAt(r.requested_at, false)} · completed {r.completed_at ? formatRequestedAt(r.completed_at, true) + ' UTC' : '—'} by {r.completed_by_profile?.display_name ?? '(unknown staff)'}
              </div>
              {r.completion_note && (
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontStyle: 'italic' }}>
                  &ldquo;{r.completion_note}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: 'var(--font-sora), system-ui', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>
        History — rejected &amp; cancelled
      </h2>
      {history.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 14, color: 'var(--ink-soft)' }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-jbmono), monospace', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: r.status === 'rejected' ? '#b91c1c' : 'var(--ink-soft)',
                    background: r.status === 'rejected' ? '#fef2f2' : 'var(--surface)',
                    padding: '3px 8px', borderRadius: 999,
                  }}
                >
                  {r.status}
                </span>
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                  {r.players?.name ?? '(player not found)'}
                </div>
              </div>
              {r.status === 'rejected' ? (
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Requested {formatRequestedAt(r.requested_at, false)} · rejected {r.handled_at ? formatRequestedAt(r.handled_at, true) + ' UTC' : '—'} by{' '}
                  {r.handled_by_profile?.display_name ?? '(unknown staff)'}
                </div>
              ) : (
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Requested {formatRequestedAt(r.requested_at, false)} · cancelled by the guardian{' '}
                  {r.cancelled_at ? formatRequestedAt(r.cancelled_at, true) + ' UTC' : ''}
                </div>
              )}
              {r.rejection_reason && (
                <div style={{ fontFamily: 'var(--font-manrope), system-ui', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontStyle: 'italic' }}>
                  &ldquo;{r.rejection_reason}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
