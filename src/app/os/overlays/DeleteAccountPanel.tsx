import type { FormEvent, ReactNode } from 'react';
import { onActivateKey } from '../a11y';
import { COACH_DELETE_CONFIRM, COACH_DELETE_REVIEW_NOTE, GUARDIAN_DELETE_CONFIRM } from '@/lib/account-deletion-copy';
import { deletionDoneMessage, sendCodeButton, type DeleteStep, type DeletionOutcome, type ReauthStatus } from '@/lib/account-deletion-flow';
import DeletionReviewStatus from './DeletionReviewStatus';

const COLORS = {
  ink: 'var(--os-ink)',
  muted: 'var(--os-muted)',
  border: 'var(--os-border)',
  danger: '#C0392B',
};

const cancelStyle = (busy: boolean) =>
  ({ flex: 1, textAlign: 'center', padding: 12, borderRadius: 11, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: COLORS.ink, cursor: busy ? 'default' : 'pointer' }) as const;
const dangerStyle = (disabled: boolean) =>
  ({ flex: 1, textAlign: 'center', padding: 12, borderRadius: 11, background: disabled ? 'rgba(192,57,43,.5)' : COLORS.danger, color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: disabled ? 'default' : 'pointer' }) as const;

export type DeleteAccountPanelProps = {
  audience: 'guardian' | 'coach';
  /** Guardian view: the selected player's name. */
  playerName?: string;
  /** Coach view: the account also has guardian links. */
  alsoGuardian?: boolean;
  email: string | null;
  emailLoaded: boolean;
  step: DeleteStep;
  reauthCode: string;
  reauthStatus: ReauthStatus;
  reauthError: string | null;
  deleteStatus: 'idle' | 'deleting' | 'error';
  deleteError: string | null;
  outcome: DeletionOutcome | null;
  /** The account's own pending deletion review (0098), if any. */
  reviewStatus: { underReview: boolean; coachAccessPaused: boolean } | null;
  /** Guardian view only: the separate player-data deletion request, shown under the button. */
  playerSection?: ReactNode;
  onStart: () => void;
  onCancel: () => void;
  onSendCode: () => void;
  onCodeChange: (code: string) => void;
  onVerify: (e: FormEvent) => void;
  onDelete: () => void;
};

/**
 * Account Settings' "Delete account" section, presentational only: state and
 * calls live in AccountSettings (OTP re-auth, then /api/os/account/delete).
 */
export default function DeleteAccountPanel(p: DeleteAccountPanelProps) {
  const playerName = p.playerName ?? '';
  const guardian = p.audience === 'guardian';
  const send = sendCodeButton({ email: p.email, emailLoaded: p.emailLoaded, reauthStatus: p.reauthStatus });
  const deleting = p.deleteStatus === 'deleting';

  return (
    <>
      {p.step !== 'done' && p.reviewStatus?.underReview && <DeletionReviewStatus coachAccessPaused={p.reviewStatus.coachAccessPaused} />}

      {p.step === 'idle' && (
        <>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: COLORS.muted, margin: '0 0 12px' }}>
            {guardian
              ? <>Permanently deletes your guardian login and access. This is separate from deleting {playerName}&apos;s data — see below.</>
              : 'Permanently deletes your Emblem login and your coach access.'}
          </p>
          <div
            role="button"
            tabIndex={0}
            aria-label="Delete account"
            onClick={p.onStart}
            onKeyDown={onActivateKey(p.onStart)}
            style={{ display: 'inline-flex', padding: '10px 16px', borderRadius: 11, border: `1px solid ${COLORS.danger}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: COLORS.danger, cursor: 'pointer' }}
          >
            Delete account
          </div>
          {p.playerSection}
        </>
      )}

      {p.step === 'explain' && (
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: COLORS.ink, marginBottom: 10 }}>Before you delete your account</div>
          {guardian ? (
            <ul style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.muted, margin: '0 0 14px', paddingLeft: 18 }}>
              <li>This deletes <b>your own guardian login</b> — the email you sign in with, and your access to Emblem OS.</li>
              <li>It does <b>not</b> delete {playerName}&apos;s profile, moments or photos — those belong to {playerName}, not your account.</li>
              <li>If another guardian is also linked to {playerName}, they keep their own full access — nothing changes for them, and {playerName}&apos;s data is not touched.</li>
              <li>If you&apos;re {playerName}&apos;s only guardian, deleting your account also removes your link to them — we file a request to delete their data too, which our team reviews and carries out by hand rather than deleting it instantly.</li>
              <li>Records that must stay connected to a physical card, an order, or another guardian&apos;s account are kept, as they are for any other guardian.</li>
            </ul>
          ) : (
            <ul style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.muted, margin: '0 0 14px', paddingLeft: 18 }}>
              <li>If nothing needs staff review (see the last point), this deletes <b>your own login</b> — the email you sign in with — and your coach access to every team and player.</li>
              <li>Players&apos; cards, moments and the recognitions you gave stay with their families, still marked as coach-verified.</li>
              <li>Any team request you sent is withdrawn.</li>
              {p.alsoGuardian && (
                <li>You&apos;re also a parent or guardian on Emblem: your guardian access goes too. Another guardian keeps full access; if you&apos;re a child&apos;s only guardian, we file a request to delete their data, which our team reviews by hand.</li>
              )}
              <li>{COACH_DELETE_REVIEW_NOTE}</li>
            </ul>
          )}
          {p.deleteError && <p role="alert" style={{ fontSize: 12, color: COLORS.danger, marginBottom: 12 }}>{p.deleteError}</p>}
          {p.reauthError && <p role="alert" style={{ fontSize: 12, color: COLORS.danger, marginBottom: 12 }}>{p.reauthError}</p>}
          <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>To confirm, we&apos;ll send a fresh code to {p.email ?? 'your email'}.</p>
          {send.note && <p style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>{send.note}</p>}
          <div style={{ display: 'flex', gap: 9 }}>
            <div role="button" tabIndex={0} aria-label="Cancel" onClick={p.onCancel} onKeyDown={onActivateKey(p.onCancel)} style={cancelStyle(false)}>
              Cancel
            </div>
            <div
              role="button"
              tabIndex={send.disabled ? -1 : 0}
              aria-label="Send verification code"
              aria-disabled={send.disabled}
              onClick={send.disabled ? undefined : p.onSendCode}
              onKeyDown={send.disabled ? undefined : onActivateKey(p.onSendCode)}
              style={dangerStyle(send.disabled)}
            >
              {send.label}
            </div>
          </div>
        </div>
      )}

      {p.step === 'reauth-code' && (
        <form onSubmit={p.onVerify}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: COLORS.ink, marginBottom: 8 }}>Enter your code</div>
          <p style={{ fontSize: 12.5, color: COLORS.muted, margin: '0 0 10px' }}>We sent a fresh code to {p.email}. Enter it to confirm it&apos;s really you before we delete anything.</p>
          <input
            type="text"
            inputMode="numeric"
            required
            value={p.reauthCode}
            onChange={(e) => p.onCodeChange(e.target.value)}
            placeholder="6-digit code"
            style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontSize: 14, marginBottom: 10 }}
          />
          {p.reauthError && <p role="alert" style={{ fontSize: 12, color: COLORS.danger, marginBottom: 10 }}>{p.reauthError}</p>}
          <div style={{ display: 'flex', gap: 9 }}>
            <div role="button" tabIndex={0} aria-label="Cancel" onClick={p.onCancel} onKeyDown={onActivateKey(p.onCancel)} style={cancelStyle(false)}>
              Cancel
            </div>
            <button type="submit" disabled={p.reauthStatus === 'verifying'} style={{ ...dangerStyle(p.reauthStatus === 'verifying'), border: 'none' }}>
              {p.reauthStatus === 'verifying' ? 'Verifying…' : 'Verify'}
            </button>
          </div>
        </form>
      )}

      {p.step === 'confirm' && (
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: COLORS.ink, marginBottom: 10 }}>Permanently delete your account?</div>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: COLORS.muted, margin: '0 0 14px' }}>{guardian ? GUARDIAN_DELETE_CONFIRM : COACH_DELETE_CONFIRM}</p>
          {p.deleteError && <p role="alert" style={{ fontSize: 12, color: COLORS.danger, marginBottom: 12 }}>{p.deleteError}</p>}
          <div style={{ display: 'flex', gap: 9 }}>
            <div role="button" tabIndex={0} aria-label="Cancel" onClick={deleting ? undefined : p.onCancel} onKeyDown={deleting ? undefined : onActivateKey(p.onCancel)} style={cancelStyle(deleting)}>
              Cancel
            </div>
            <div role="button" tabIndex={0} aria-label="Permanently delete my account" aria-disabled={deleting} onClick={deleting ? undefined : p.onDelete} onKeyDown={deleting ? undefined : onActivateKey(p.onDelete)} style={dangerStyle(deleting)}>
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </div>
          </div>
        </div>
      )}

      {p.step === 'done' && p.outcome && (
        <p role="status" style={{ fontSize: 13.5, fontWeight: 700, color: '#2E9E5B', textAlign: 'center', padding: '10px 0', lineHeight: 1.5 }}>
          {deletionDoneMessage(p.outcome)}
        </p>
      )}
    </>
  );
}
