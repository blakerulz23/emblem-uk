import type { ComponentType } from 'react';
import type { DeletionPreview } from '@/lib/staff-account-deletion';
import AccountDeletionActions from './AccountDeletionActions';

/**
 * The /staff/account-deletions page body (presentational; page.tsx loads the
 * data). Counts only: no child names or content.
 */
export type PendingRow = { id: string; auth_user_id: string; email: string | null; blocking_reason: string; first_detected_at: string };
export type DecidedRow = PendingRow & { status: string; resolved_at: string | null };
export type ActionRow = { pending_deletion_id: string; action: string; outcome: string; actor_profile_id: string; created_at: string };
export type ActionsProps = { id: string; mode: 'review' | 'retry-sign-in' | 'retry-restore'; preview: DeletionPreview | null };

const BLOCKING_LABEL: Record<string, string> = {
  coach_authored_player_records: 'Coach-written player records',
  squad_invite_organiser_history: 'Squad Invite organiser history',
  squad_invite_audit_history: 'Squad Invite audit history',
};
const font = { sans: 'var(--font-manrope), system-ui', head: 'var(--font-sora), system-ui' };

/** A short, non-identifying reference: the first characters of the request id (never the account's). */
export const requestRef = (requestId: string) => requestId.replace(/-/g, '').slice(0, 8).toUpperCase();

/** How an account is named on this page: an erased account never by its email. */
export function accountLabel(row: PendingRow, erased: boolean): string {
  if (erased) return `Erased account · ref ${requestRef(row.id)}`;
  return row.email ?? `Account · ref ${requestRef(row.id)}`;
}

const ACTION_LABEL: Record<string, string> = {
  complete: 'Deletion completed',
  reject: 'Deletion rejected',
  restore: 'Coaching restored',
  remove_sign_in: 'Sign-in removal',
  self_deleted: 'Account deleted itself',
};
const at = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC' : '—';

export default function AccountDeletionsView({
  pending,
  decided,
  signInPending,
  erased,
  unrestored,
  actions,
  previews,
  Actions = AccountDeletionActions,
}: {
  pending: PendingRow[];
  decided: DecidedRow[];
  /** auth user ids whose sign-in removal is still queued (pending_auth_deletions). */
  signInPending: string[];
  /** auth user ids recorded in erased_accounts (actually deleted). */
  erased: string[];
  /** rejected request id -> coaching suspensions still not restored. */
  unrestored: Record<string, number>;
  actions: ActionRow[];
  previews: Record<string, DeletionPreview | null>;
  Actions?: ComponentType<ActionsProps>;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14">
      <span style={{ fontFamily: 'var(--font-jbmono), monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-tint)', padding: '6px 12px', borderRadius: 999, display: 'inline-block' }}>
        Internal · Staff only
      </span>
      <h1 style={{ fontFamily: font.head, fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '20px 0 6px' }}>Account deletions under review</h1>
      <p style={{ fontFamily: font.sans, fontSize: 15, color: 'var(--ink-soft)', margin: '0 0 8px' }}>
        These accounts asked to be deleted, but records that must be kept stopped it finishing automatically. Nothing has been deleted; only coaching
        access is paused. Reject to give the account its coaching access back, or, once nothing blocks it, complete the deletion permanently.
      </p>

      <h2 style={{ fontFamily: font.head, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>Waiting for a decision ({pending.length})</h2>
      {pending.length === 0 ? (
        <p style={{ fontFamily: font.sans, fontSize: 14, color: 'var(--ink-soft)' }}>Nothing waiting.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pending.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontFamily: font.head, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                {accountLabel(r, false)}
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                Requested {at(r.first_detected_at)} · Held for review because of: {BLOCKING_LABEL[r.blocking_reason] ?? r.blocking_reason}
              </div>
              <Actions id={r.id} mode="review" preview={previews[r.id] ?? null} />
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: font.head, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>Recently decided</h2>
      {decided.length === 0 ? (
        <p style={{ fontFamily: font.sans, fontSize: 14, color: 'var(--ink-soft)' }}>None yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {decided.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontFamily: font.sans, fontSize: 13, color: 'var(--ink)' }}>
                {accountLabel(r, erased.includes(r.auth_user_id))} —{' '}
                {erased.includes(r.auth_user_id)
                  ? 'Deleted'
                  : r.status === 'rejected'
                    ? 'Rejected (account kept)'
                    : 'Closed (not deleted here)'}{' '}
                {at(r.resolved_at)}
              </div>
              {r.status === 'rejected' && !erased.includes(r.auth_user_id) && (unrestored[r.id] ?? 0) > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontFamily: font.sans, fontSize: 12.5, color: '#92400e' }}>
                    {unrestored[r.id]} coaching relationship(s) paused for this review have not been restored yet.
                  </div>
                  <Actions id={r.id} mode="retry-restore" preview={null} />
                </div>
              )}
              {erased.includes(r.auth_user_id) && signInPending.includes(r.auth_user_id) && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontFamily: font.sans, fontSize: 12.5, color: '#92400e' }}>
                    The account is erased and Emblem refuses its sessions, but its sign-in has not been removed yet.
                  </div>
                  <Actions id={r.id} mode="retry-sign-in" preview={null} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: font.head, fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '32px 0 12px' }}>Recent decisions and deletions</h2>
      {actions.length === 0 ? (
        <p style={{ fontFamily: font.sans, fontSize: 14, color: 'var(--ink-soft)' }}>None yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontFamily: font.sans, fontSize: 12.5, color: 'var(--ink-soft)' }}>
          {actions.map((a, i) => (
            <li key={i} style={{ padding: '3px 0' }}>
              {at(a.created_at)} · {ACTION_LABEL[a.action] ?? a.action} · {a.outcome} ·{' '}
              {a.action === 'self_deleted' ? 'by the account itself' : `by staff ${a.actor_profile_id.slice(0, 8)}…`} · ref {requestRef(a.pending_deletion_id)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
