import {
  COMPLETE_TYPED_WORD,
  completionAvailability,
  validateStaffReason,
  type ActionResult,
  type DeletionPreview,
} from '@/lib/staff-account-deletion';

/**
 * One reviewed account deletion on /staff/account-deletions. Presentational
 * only (no hooks): AccountDeletionActions owns the state. Shows counts only,
 * never child names or content.
 *
 * Modes:
 *   review         a waiting request: reject & restore, or complete permanently
 *   retry-sign-in  a completed, erased request whose sign-in removal failed
 *   retry-restore  a rejected request whose coaching restore did not finish
 */
export type PanelStage = 'choose' | 'confirm-reject' | 'confirm-complete';
export type PanelMode = 'review' | 'retry-sign-in' | 'retry-restore';

export type AccountDeletionPanelProps = {
  /** Unique per row (the request id): keeps element ids unique when several rows are open. */
  idPrefix: string;
  mode: PanelMode;
  preview: DeletionPreview | null;
  reason: string;
  stage: PanelStage;
  typed: string;
  busy: boolean;
  result: ActionResult | null;
  onReason: (v: string) => void;
  onStage: (s: PanelStage) => void;
  onTyped: (v: string) => void;
  onReject: () => void;
  onComplete: () => void;
  /** Shown after a result: reloads the list (the row then moves or disappears). */
  onRefresh?: () => void;
};

const font = { sans: 'var(--font-manrope), system-ui', head: 'var(--font-sora), system-ui' };
const TONE = {
  success: { color: '#047857', background: '#ecfdf5' },
  warning: { color: '#92400e', background: '#fffbeb' },
  error: { color: '#b91c1c', background: '#fef2f2' },
};
const REASON_LABEL: Record<PanelMode, string> = {
  review: 'Reason for your decision (recorded with your name)',
  'retry-sign-in': 'Reason for retrying the sign-in removal (recorded with your name)',
  'retry-restore': 'Reason for retrying the restore (recorded with your name)',
};

function Count({ n, label }: { n: number; label: string }) {
  return (
    <li style={{ display: 'flex', gap: 8, fontFamily: font.sans, fontSize: 13, color: 'var(--ink)', padding: '2px 0' }}>
      <b style={{ minWidth: 22, textAlign: 'right' }}>{n}</b>
      <span style={{ color: 'var(--ink-soft)' }}>{label}</span>
    </li>
  );
}

export function PreviewCounts({ p }: { p: DeletionPreview }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, margin: '10px 0' }}>
      <div>
        <div style={{ fontFamily: font.head, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>Completing permanently would</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <Count n={p.removes.parentLinksShared} label="parent link(s) removed where another parent remains" />
          <Count n={p.removes.childrenToDeletionReview} label="child(ren) with no other parent: deletion request filed for staff" />
          <Count n={p.removes.cardsToLock} label="card(s) locked pending that child deletion" />
          <Count n={p.clears.momentsUploaded} label="upload(s) kept, uploader cleared" />
          <Count n={p.clears.invites} label="invite(s) kept, this account removed from them" />
          <Count n={p.clears.ordersApproved} label="order approval(s) kept, approver cleared" />
          <Count n={p.marks.verifiedMoments} label="verified moment(s) kept, marked “verifier account deleted”" />
          <Count n={p.marks.cancelledRequests} label="cancelled request(s) kept, marked “account deleted”" />
        </ul>
      </div>
      <div>
        <div style={{ fontFamily: font.head, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', marginBottom: 4 }}>Right now</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <Count n={p.blockers.coachAuthoredRecords + p.blockers.squadInviteOrganiser + p.blockers.squadInviteAudit} label="record(s) that must be kept and block deletion" />
          <Count n={p.coaching.suspendedForReview} label="coaching relationship(s) paused for the review" />
        </ul>
        <p style={{ fontFamily: font.sans, fontSize: 12, color: 'var(--ink-soft)', margin: '6px 0 0' }}>
          Until a decision, nothing above has changed: parent links, cards, children&rsquo;s records, uploads and invites are all in place.
        </p>
      </div>
    </div>
  );
}

const button = (bg: string, color: string, disabled: boolean, border = 'none') => ({
  fontFamily: font.head,
  fontWeight: 700,
  fontSize: 12.5,
  color: disabled ? 'var(--ink-faint)' : color,
  background: disabled ? 'var(--surface)' : bg,
  border: disabled ? '1px dashed var(--ink-faint)' : border,
  padding: '9px 14px',
  borderRadius: 10,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

export default function AccountDeletionPanel(props: AccountDeletionPanelProps) {
  const { mode, preview, reason, stage, typed, busy, result } = props;
  const reasonError = reason.trim() ? validateStaffReason(reason) : null;
  const reasonOk = !validateStaffReason(reason);
  const availability = mode === 'review' ? completionAvailability(preview) : ({ ok: true } as const);
  const armed = typed.trim().toUpperCase() === COMPLETE_TYPED_WORD;
  // After a decision went through, the row is stale until refreshed: no more actions on it.
  const decided = !!result && result.tone !== 'error';
  const cancelOnEscape = (e: { key: string }) => {
    if (e.key === 'Escape' && !busy) props.onStage('choose');
  };

  return (
    <div>
      {mode === 'review' && preview && <PreviewCounts p={preview} />}
      {mode === 'review' && !preview && (
        <p style={{ fontFamily: font.sans, fontSize: 12.5, color: '#b91c1c' }}>The counts could not be loaded. Refresh the page.</p>
      )}

      {!decided && (
        <>
          <label style={{ display: 'block', fontFamily: font.head, fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', margin: '8px 0 4px' }}>
            {REASON_LABEL[mode]}
            <textarea
              value={reason}
              onChange={(e) => props.onReason(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={busy}
              placeholder={mode === 'review' ? 'e.g. blocking records reassigned; parent confirmed by email' : 'e.g. retrying after an Auth outage'}
              style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: font.sans, fontSize: 12.5, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', resize: 'vertical' }}
            />
          </label>
          {reasonError && <div style={{ fontFamily: font.sans, fontSize: 12, color: '#b91c1c' }}>{reasonError}</div>}
          {!reason.trim() && stage === 'choose' && (
            <div style={{ fontFamily: font.sans, fontSize: 12, color: 'var(--ink-soft)' }}>Enter a reason to continue.</div>
          )}
        </>
      )}

      {stage === 'choose' && mode === 'review' && !decided && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" disabled={busy || !reasonOk} onClick={() => props.onStage('confirm-reject')} style={button('#ecfdf5', '#047857', busy || !reasonOk, '1px solid #a7f3d0')}>
            Reject &amp; restore access
          </button>
          <button
            type="button"
            disabled={busy || !reasonOk || !availability.ok}
            onClick={() => props.onStage('confirm-complete')}
            style={button('#b91c1c', '#fff', busy || !reasonOk || !availability.ok)}
          >
            Complete deletion permanently…
          </button>
          {!availability.ok && <div style={{ flexBasis: '100%', fontFamily: font.sans, fontSize: 12, color: '#92400e' }}>{availability.why}</div>}
        </div>
      )}

      {stage === 'choose' && mode === 'retry-sign-in' && !decided && (
        <div style={{ marginTop: 10 }}>
          <button type="button" disabled={busy || !reasonOk} onClick={props.onComplete} style={button('#1f2937', '#fff', busy || !reasonOk)}>
            {busy ? 'Retrying…' : 'Retry sign-in removal'}
          </button>
        </div>
      )}

      {stage === 'choose' && mode === 'retry-restore' && !decided && (
        <div style={{ marginTop: 10 }}>
          <button type="button" disabled={busy || !reasonOk} onClick={props.onReject} style={button('#047857', '#fff', busy || !reasonOk)}>
            {busy ? 'Restoring…' : 'Retry restoring coaching access'}
          </button>
        </div>
      )}

      {stage === 'confirm-reject' && (
        <div role="group" aria-labelledby={`${props.idPrefix}-confirm-reject-title`} onKeyDown={cancelOnEscape} style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
          <div id={`${props.idPrefix}-confirm-reject-title`} style={{ fontFamily: font.head, fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>Reject this deletion request?</div>
          <p style={{ fontFamily: font.sans, fontSize: 12.5, color: 'var(--ink-soft)', margin: '4px 0 10px' }}>
            The account keeps everything, and exactly the coaching access paused for this review is restored. Nothing is deleted.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the confirmation it just opened, on the safe choice */}
            <button type="button" autoFocus disabled={busy} onClick={() => props.onStage('choose')} style={button('var(--surface)', 'var(--ink-soft)', busy)}>Cancel</button>
            <button type="button" disabled={busy || !reasonOk} onClick={props.onReject} style={button('#047857', '#fff', busy || !reasonOk)}>
              {busy ? 'Rejecting…' : 'Reject and restore access'}
            </button>
          </div>
        </div>
      )}

      {stage === 'confirm-complete' && (
        <div role="group" aria-labelledby={`${props.idPrefix}-confirm-complete-title`} onKeyDown={cancelOnEscape} style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div id={`${props.idPrefix}-confirm-complete-title`} style={{ fontFamily: font.head, fontWeight: 800, fontSize: 13.5, color: '#991b1b' }}>Permanently delete this account? This cannot be undone.</div>
          <p style={{ fontFamily: font.sans, fontSize: 12.5, color: '#7f1d1d', margin: '4px 0 8px' }}>
            The clean-up above runs once and the account is erased; Emblem then refuses its sessions and cannot let it recreate the account.
            Its sign-in is then blocked and removed, and you will be told if that step fails.
          </p>
          <label style={{ display: 'block', fontFamily: font.sans, fontSize: 12.5, color: '#7f1d1d' }}>
            Type <b>{COMPLETE_TYPED_WORD}</b> to confirm
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the confirmation it just opened */}
            <input
              autoFocus
              value={typed}
              onChange={(e) => props.onTyped(e.target.value)}
              disabled={busy}
              aria-label={`Type ${COMPLETE_TYPED_WORD} to confirm`}
              style={{ display: 'block', marginTop: 4, fontFamily: font.sans, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid #fca5a5', width: 160 }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => props.onStage('choose')} style={button('var(--surface)', 'var(--ink-soft)', busy)}>Cancel</button>
            <button type="button" disabled={busy || !armed || !reasonOk || !availability.ok} onClick={props.onComplete} style={button('#b91c1c', '#fff', busy || !armed || !reasonOk || !availability.ok)}>
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, fontFamily: font.sans, fontSize: 12.5, ...TONE[result.tone] }}>
          {result.text}
          {props.onRefresh && result.tone !== 'error' && (
            <button type="button" onClick={props.onRefresh} style={{ marginLeft: 10, fontFamily: font.head, fontWeight: 700, fontSize: 12, background: 'transparent', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit' }}>
              Refresh list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
