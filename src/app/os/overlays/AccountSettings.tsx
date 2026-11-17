'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { onActivateKey } from '../a11y';
import { useOsPhotoUpload } from '../useOsPhotoUpload';
import {
  CLEARED_DELETE_FLOW,
  deletionOutcome,
  deletionRedirectDelayMs,
  sendCodeFailureMessage,
  type DeleteStep,
  type DeletionOutcome,
  type ReauthStatus,
} from '@/lib/account-deletion-flow';
import DeleteAccountPanel from './DeleteAccountPanel';

const COLORS = {
  card: 'var(--os-card)',
  ink: 'var(--os-ink)',
  muted: 'var(--os-muted)',
  border: 'var(--os-border)',
  danger: '#C0392B',
  dangerBg: 'rgba(192,57,43,.08)',
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 14 }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: COLORS.muted, marginBottom: 12, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

/**
 * Real, functional MVP Account Settings — opened from Profile.tsx's
 * ACCOUNT MANAGEMENT card (parent view, scoped to the selected player) and
 * from CoachProfile's Account row (coach view, no player). Account info,
 * sign out and delete account always; the player-scoped sections (public
 * profile, photo, player-data deletion request) only with a player.
 * Deliberately no themes, notifications, subscriptions, or connected apps,
 * per the explicit MVP scope.
 *
 * Delete account is the same flow for everyone: OTP re-auth, then
 * /api/os/account/delete (delete_own_guardian_account). From migrations
 * 0097/0098 it either erases the account at once (a coach's coach_team rows,
 * direct links and team requests go with it; moments they verified stay
 * coach-verified) or, when the account wrote records that must be kept
 * (player assessments, goals, strengths, season focus, Squad Invite
 * history), files a staff review: nothing is deleted, and any coach access
 * is paused until staff reject (restoring it) or complete the deletion.
 */
type PlayerScope = {
  playerId: string;
  playerName: string;
  publicIdEnabled: boolean;
  publicPlayerId: string | null;
  onPublicVisibilityChanged: () => void;
};

export type AccountSettingsProps = { onClose: () => void } & (
  | (PlayerScope & { audience?: 'guardian' })
  | {
      /** Coach view: account-wide only, no player sections. */
      audience: 'coach';
      /** The account also has guardian links (a dual-role person), so deletion copy mentions them. */
      alsoGuardian?: boolean;
      playerId?: undefined;
    }
);

export default function AccountSettings(props: AccountSettingsProps) {
  const { onClose } = props;
  const player: PlayerScope | null = props.audience === 'coach' ? null : props;
  const alsoGuardian = props.audience === 'coach' ? !!props.alsoGuardian : true;
  const playerName = player?.playerName ?? '';
  const closeButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Account info ---
  const [email, setEmail] = useState<string | null>(null);
  // Send code stays disabled until this has settled (it needs the address).
  const [emailLoaded, setEmailLoaded] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => setEmail(null))
      .finally(() => setEmailLoaded(true));
  }, []);

  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // A hard navigation, not router.refresh() — this resets the OS
    // shell's own client-side "activated" state too, not just the
    // server-rendered session, so the sign-in entry point always shows
    // correctly rather than depending on ActivationGate's client state
    // happening to already be false.
    window.location.assign('/os');
  };

  // --- Delete account: two-step destructive confirm, OTP re-auth (DeleteAccountPanel) ---
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [reauthCode, setReauthCode] = useState('');
  const [reauthStatus, setReauthStatus] = useState<ReauthStatus>('idle');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [deleteAccountStatus, setDeleteAccountStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  // What the server reported: a staff review (0097, nothing deleted), a
  // partial completion (sign-in revocation still finishing) or a deletion.
  // Neither of the first two may ever read as a flat "deleted".
  const [deleteOutcome, setDeleteOutcome] = useState<DeletionOutcome | null>(null);
  // The account's own deletion review, if one is pending (migration 0098).
  const [reviewStatus, setReviewStatus] = useState<{ underReview: boolean; coachAccessPaused: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/os/account/deletion-review')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled && body && typeof body.underReview === 'boolean') {
          setReviewStatus({ underReview: body.underReview, coachAccessPaused: body.coachAccessPaused === true });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel closes the flow and clears every message it showed.
  const cancelDelete = () => {
    setDeleteStep(CLEARED_DELETE_FLOW.step);
    setReauthCode(CLEARED_DELETE_FLOW.reauthCode);
    setReauthStatus(CLEARED_DELETE_FLOW.reauthStatus);
    setReauthError(CLEARED_DELETE_FLOW.reauthError);
    setDeleteAccountError(CLEARED_DELETE_FLOW.deleteError);
  };

  const sendReauthCode = async () => {
    if (!emailLoaded || !email || reauthStatus === 'sending') return;
    setReauthStatus('sending');
    setReauthError(null);
    setDeleteAccountError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        // Shown on the step the person is on (explain), not on the next one.
        setReauthStatus('error');
        setReauthError(sendCodeFailureMessage(error.message));
        return;
      }
    } catch {
      setReauthStatus('error');
      setReauthError(sendCodeFailureMessage('Check your connection and try again.'));
      return;
    }
    setReauthStatus('idle');
    setReauthCode('');
    setDeleteStep('reauth-code');
  };

  const verifyReauthCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || reauthStatus === 'verifying') return;
    setReauthStatus('verifying');
    setReauthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: reauthCode.trim(), type: 'email' });
    if (error) {
      setReauthStatus('error');
      setReauthError(error.message);
      return;
    }
    setReauthStatus('idle');
    setDeleteStep('confirm');
  };

  const deleteAccount = async () => {
    if (deleteAccountStatus === 'deleting') return;
    setDeleteAccountStatus('deleting');
    setDeleteAccountError(null);
    try {
      const res = await fetch('/api/os/account/delete', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === 'REAUTH_REQUIRED') {
          setDeleteAccountStatus('idle');
          setDeleteStep('explain');
          setDeleteAccountError('That took a little too long — please verify your email code again.');
          return;
        }
        setDeleteAccountStatus('error');
        setDeleteAccountError((body && typeof body.error === 'string' && body.error) || 'Could not delete your account — try again.');
        return;
      }
      const outcome = deletionOutcome(await res.json().catch(() => null));
      setDeleteOutcome(outcome);
      setDeleteStep('done');
      setTimeout(() => window.location.assign('/os'), deletionRedirectDelayMs(outcome));
    } catch {
      setDeleteAccountStatus('error');
      setDeleteAccountError('Could not reach the server — check your connection and try again.');
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--os-screen)', display: 'flex', flexDirection: 'column', fontFamily: 'Roboto' }}
      role="dialog"
      aria-modal="true"
      aria-label="Account Settings"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 10px', flex: '0 0 auto' }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 15, color: COLORS.ink, textTransform: 'uppercase' }}>Account Settings</span>
        <div
          ref={closeButtonRef}
          role="button"
          tabIndex={0}
          aria-label="Close"
          onClick={onClose}
          onKeyDown={onActivateKey(onClose)}
          style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" stroke={COLORS.ink} strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 40px' }}>
        <SectionCard title="Account">
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 3 }}>Signed in as</div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink, marginBottom: 16, wordBreak: 'break-word' }}>{email ?? '—'}</div>
          <div
            role="button"
            tabIndex={0}
            aria-label="Sign out"
            onClick={signOut}
            onKeyDown={onActivateKey(signOut)}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 16px', borderRadius: 11, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: COLORS.ink, cursor: signingOut ? 'default' : 'pointer', opacity: signingOut ? 0.6 : 1 }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </div>
        </SectionCard>

        {player && <PlayerPublicAndMediaSections player={player} />}

        <SectionCard title="Delete account">
          <DeleteAccountPanel
            audience={player ? 'guardian' : 'coach'}
            playerName={playerName}
            alsoGuardian={alsoGuardian}
            email={email}
            emailLoaded={emailLoaded}
            step={deleteStep}
            reauthCode={reauthCode}
            reauthStatus={reauthStatus}
            reauthError={reauthError}
            deleteStatus={deleteAccountStatus}
            deleteError={deleteAccountError}
            outcome={deleteOutcome}
            reviewStatus={reviewStatus}
            playerSection={player ? <PlayerDataDeletionRequest player={player} /> : null}
            onStart={() => setDeleteStep('explain')}
            onCancel={cancelDelete}
            onSendCode={sendReauthCode}
            onCodeChange={setReauthCode}
            onVerify={verifyReauthCode}
            onDelete={deleteAccount}
          />
        </SectionCard>
      </div>
    </div>
  );
}

/** Public profile and photo controls for one player (parent view only). */
function PlayerPublicAndMediaSections({ player }: { player: PlayerScope }) {
  const { playerId, playerName, publicIdEnabled, publicPlayerId, onPublicVisibilityChanged } = player;
  const router = useRouter();
  // --- Public profile control (same route/RPC as Profile.tsx's own Share Profile) ---
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const togglePublicVisibility = async () => {
    if (publicBusy) return;
    setPublicBusy(true);
    setPublicError(null);
    try {
      const res = await fetch(`/api/os/players/${playerId}/public-profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !publicIdEnabled }),
      });
      if (!res.ok) {
        setPublicError("Couldn't update the public profile setting — try again.");
        return;
      }
      onPublicVisibilityChanged();
      router.refresh();
    } catch {
      setPublicError('Could not reach the server — check your connection and try again.');
    } finally {
      setPublicBusy(false);
    }
  };

  // --- Photo ---
  const { status: uploadStatus, error: uploadError, uploadPhoto, removeStatus, removeError, removePhoto } = useOsPhotoUpload(playerId);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);


  return (
    <>
        <SectionCard title="Public profile">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{playerName}&apos;s public link</div>
              <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>
                {publicIdEnabled ? 'Anyone with the link can view it.' : 'Currently off — no one can view it.'}
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label={publicIdEnabled ? 'Turn off public profile' : 'Turn on public profile'}
              onClick={togglePublicVisibility}
              onKeyDown={onActivateKey(togglePublicVisibility)}
              style={{ flex: '0 0 auto', padding: '9px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: publicIdEnabled ? COLORS.muted : '#E97435', cursor: publicBusy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {publicBusy ? 'Updating…' : publicIdEnabled ? 'Turn off' : 'Turn on'}
            </div>
          </div>
          {publicIdEnabled && publicPlayerId && (
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 10, wordBreak: 'break-all' }}>/player/{publicPlayerId}</div>
          )}
          {publicError && <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>{publicError}</p>}
        </SectionCard>

        <SectionCard title="Media and privacy">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink, marginBottom: 10 }}>{playerName}&apos;s photo</div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) uploadPhoto(file);
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div
              role="button"
              tabIndex={0}
              aria-label="Replace photo"
              onClick={() => photoInputRef.current?.click()}
              onKeyDown={onActivateKey(() => photoInputRef.current?.click())}
              style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: COLORS.ink, cursor: uploadStatus === 'uploading' ? 'default' : 'pointer' }}
            >
              {uploadStatus === 'uploading' ? 'Uploading…' : 'Replace photo'}
            </div>
            {!confirmRemovePhoto ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Remove photo"
                onClick={() => setConfirmRemovePhoto(true)}
                onKeyDown={onActivateKey(() => setConfirmRemovePhoto(true))}
                style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: COLORS.danger, cursor: 'pointer' }}
              >
                Remove photo
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: COLORS.muted }}>Remove the current photo?</span>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Confirm remove photo"
                  onClick={async () => {
                    await removePhoto();
                    setConfirmRemovePhoto(false);
                  }}
                  onKeyDown={onActivateKey(async () => {
                    await removePhoto();
                    setConfirmRemovePhoto(false);
                  })}
                  style={{ padding: '8px 12px', borderRadius: 9, background: removeStatus === 'uploading' ? 'rgba(192,57,43,.5)' : COLORS.danger, color: '#fff', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, cursor: removeStatus === 'uploading' ? 'default' : 'pointer' }}
                >
                  {removeStatus === 'uploading' ? 'Removing…' : 'Remove'}
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Cancel remove photo"
                  onClick={() => setConfirmRemovePhoto(false)}
                  onKeyDown={onActivateKey(() => setConfirmRemovePhoto(false))}
                  style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: COLORS.ink, cursor: 'pointer' }}
                >
                  Cancel
                </div>
              </div>
            )}
          </div>
          {uploadError && <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>{uploadError}</p>}
          {removeError && <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>{removeError}</p>}

          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Delete a moment</div>
            <p style={{ fontSize: 12, color: COLORS.muted, margin: '0 0 0' }}>
              Open any moment in Home or Collection and use its menu to delete it permanently, including its photos or videos.
            </p>
          </div>
        </SectionCard>
    </>
  );
}

/** The "Delete <player>'s data" request (staff-reviewed), parent view only. */
function PlayerDataDeletionRequest({ player }: { player: PlayerScope }) {
  const { playerId, playerName } = player;
  // --- Request player-data deletion ---
  const [confirmRequestDeletion, setConfirmRequestDeletion] = useState(false);
  const [deletionRequestStatus, setDeletionRequestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [deletionRequestError, setDeletionRequestError] = useState<string | null>(null);
  const [deletionRequestId, setDeletionRequestId] = useState<string | null>(null);
  const requestPlayerDeletion = async () => {
    if (deletionRequestStatus === 'sending') return;
    setDeletionRequestStatus('sending');
    setDeletionRequestError(null);
    try {
      const res = await fetch(`/api/os/players/${playerId}/deletion-request`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setDeletionRequestStatus('error');
        setDeletionRequestError((body && typeof body.error === 'string' && body.error) || 'Could not send the request — try again.');
        return;
      }
      const body = await res.json().catch(() => null);
      setDeletionRequestId(typeof body?.requestId === 'string' ? body.requestId : null);
      setDeletionRequestStatus('sent');
    } catch {
      setDeletionRequestStatus('error');
      setDeletionRequestError('Could not reach the server — check your connection and try again.');
    }
  };

  // On open, check for an already-pending request from an earlier session
  // — deletionRequestStatus above only knows about one filed just now,
  // not one that already existed before this Account Settings visit. RLS
  // ("guardians can view their own requests", 0041) already scopes this
  // select to the caller, so no extra server check is needed for the read.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('player_deletion_requests')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'pending')
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.id) {
          setDeletionRequestId(data.id);
          setDeletionRequestStatus('sent');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  // --- Cancel a pending player-data deletion request ---
  const [confirmCancelDeletion, setConfirmCancelDeletion] = useState(false);
  const [cancelDeletionStatus, setCancelDeletionStatus] = useState<'idle' | 'cancelling' | 'cancelled' | 'error'>('idle');
  const [cancelDeletionError, setCancelDeletionError] = useState<string | null>(null);
  const cancelPlayerDeletionRequest = async () => {
    if (cancelDeletionStatus === 'cancelling') return;
    setCancelDeletionStatus('cancelling');
    setCancelDeletionError(null);
    try {
      const res = await fetch(`/api/os/players/${playerId}/deletion-request/cancel`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setCancelDeletionStatus('error');
        setCancelDeletionError((body && typeof body.error === 'string' && body.error) || 'Could not cancel the request — try again.');
        return;
      }
      // Nothing else changes — no player, media, account or card data is
      // touched by a cancellation, and public profile visibility is left
      // exactly as it was (this action never reads or writes it).
      setCancelDeletionStatus('cancelled');
      setConfirmCancelDeletion(false);
    } catch {
      setCancelDeletionStatus('error');
      setCancelDeletionError('Could not reach the server — check your connection and try again.');
    }
  };


  return (
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 18, paddingTop: 16 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink, marginBottom: 4 }}>Delete {playerName}&apos;s data</div>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: COLORS.muted, margin: '0 0 10px' }}>
                  Sends a request to permanently delete {playerName}&apos;s profile, moments and photos. A member of our team reviews and carries this out — it is not instant.
                </p>
                {deletionRequestStatus === 'sent' ? (
                  cancelDeletionStatus === 'cancelled' ? (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.ink }}>
                      <p style={{ fontWeight: 700, color: COLORS.muted, margin: '0 0 4px' }}>Request cancelled.</p>
                      <p style={{ margin: 0, color: COLORS.muted }}>
                        {playerName}&apos;s data was never deleted, and nothing else has changed.
                      </p>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.ink }}>
                      <p style={{ fontWeight: 700, color: '#2E9E5B', margin: '0 0 4px' }}>Request received — status: Pending.</p>
                      {deletionRequestId && (
                        <p style={{ margin: '0 0 4px', color: COLORS.muted }}>
                          Reference: <span style={{ fontFamily: 'monospace' }}>{deletionRequestId.slice(0, 8)}</span>
                        </p>
                      )}
                      <p style={{ margin: '0 0 10px', color: COLORS.muted }}>
                        Our team will review it — {playerName}&apos;s data has <b>not</b> been deleted yet. We&apos;ll confirm by email once it&apos;s actually done.
                      </p>
                      {!confirmCancelDeletion ? (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label="Cancel deletion request"
                          onClick={() => setConfirmCancelDeletion(true)}
                          onKeyDown={onActivateKey(() => setConfirmCancelDeletion(true))}
                          style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 9, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: COLORS.ink, cursor: 'pointer' }}
                        >
                          Cancel deletion request
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 12, color: COLORS.muted }}>Withdraw this request? {playerName}&apos;s data was never deleted.</span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label="Confirm cancel deletion request"
                              onClick={cancelPlayerDeletionRequest}
                              onKeyDown={onActivateKey(cancelPlayerDeletionRequest)}
                              style={{ padding: '8px 12px', borderRadius: 9, background: cancelDeletionStatus === 'cancelling' ? 'rgba(21,19,15,.4)' : COLORS.ink, color: '#fff', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, cursor: cancelDeletionStatus === 'cancelling' ? 'default' : 'pointer' }}
                            >
                              {cancelDeletionStatus === 'cancelling' ? 'Cancelling…' : 'Confirm cancel'}
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label="Keep deletion request"
                              onClick={() => setConfirmCancelDeletion(false)}
                              onKeyDown={onActivateKey(() => setConfirmCancelDeletion(false))}
                              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: COLORS.ink, cursor: 'pointer' }}
                            >
                              Keep request
                            </div>
                          </div>
                        </div>
                      )}
                      {cancelDeletionError && <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>{cancelDeletionError}</p>}
                    </div>
                  )
                ) : !confirmRequestDeletion ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Request deletion of ${playerName}'s data`}
                    onClick={() => setConfirmRequestDeletion(true)}
                    onKeyDown={onActivateKey(() => setConfirmRequestDeletion(true))}
                    style={{ display: 'inline-flex', padding: '9px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: COLORS.ink, cursor: 'pointer' }}
                  >
                    Request player-data deletion
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: COLORS.muted }}>Send this request? This does not delete anything yet — our team reviews it first.</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Confirm request deletion of ${playerName}'s data`}
                        onClick={requestPlayerDeletion}
                        onKeyDown={onActivateKey(requestPlayerDeletion)}
                        style={{ padding: '8px 12px', borderRadius: 9, background: deletionRequestStatus === 'sending' ? 'rgba(21,19,15,.4)' : COLORS.ink, color: '#fff', fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, cursor: deletionRequestStatus === 'sending' ? 'default' : 'pointer' }}
                      >
                        {deletionRequestStatus === 'sending' ? 'Sending…' : 'Confirm request'}
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label="Cancel request"
                        onClick={() => setConfirmRequestDeletion(false)}
                        onKeyDown={onActivateKey(() => setConfirmRequestDeletion(false))}
                        style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${COLORS.border}`, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: COLORS.ink, cursor: 'pointer' }}
                      >
                        Cancel
                      </div>
                    </div>
                  </div>
                )}
                {deletionRequestError && <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 8 }}>{deletionRequestError}</p>}
              </div>
  );
}
