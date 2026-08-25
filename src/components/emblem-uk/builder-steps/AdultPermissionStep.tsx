'use client';

import { useMemo, useReducer, useRef, useState } from 'react';
import {
  BUILDER_AUTHORITY_CONFIRMATIONS,
  type BuilderAuthorityRelationship,
} from '@/lib/builder-authority-shared';
import {
  GENERIC_FAILURE,
  INITIAL_CONFIRM_SUBMIT_STATE,
  TIMEOUT_FAILURE,
  confirmButtonLabel,
  confirmSubmitReducer,
  createAttemptTracker,
  isNonGuardianRelationship,
  postJson,
} from '@/lib/builder-authority-client';
import { RequestTimeoutError } from '@/lib/fetch-with-timeout';

type Phase = 'email' | 'code' | 'details';

const RELATIONSHIP_OPTIONS: { value: BuilderAuthorityRelationship; label: string }[] = [
  { value: 'parent_guardian', label: 'Parent or legal guardian' },
  { value: 'coach', label: 'Coach' },
  { value: 'club_organiser', label: 'Club organiser' },
  { value: 'other_adult', label: 'Another adult' },
];

/**
 * The short "Adult permission" step (migration 0071) shown once, right
 * before the ordinary (non-Squad-Invite) builder submits an order. Owns its
 * own email/code/declaration state entirely — nothing here is written
 * anywhere until record_builder_authority_declaration (called from
 * /api/builder-authority/declare) actually succeeds server-side; the three
 * checkboxes below are never preselected and are not themselves what
 * authorises anything.
 */
export default function AdultPermissionStep({
  getSubmissionKey,
  onConfirmed,
  onBack,
}: {
  getSubmissionKey: () => Promise<string>;
  onConfirmed: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState<BuilderAuthorityRelationship | ''>('');
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [confirmedPhoto, setConfirmedPhoto] = useState(false);
  const [confirmedCreation, setConfirmedCreation] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [relationshipError, setRelationshipError] = useState('');
  const [busy, setBusy] = useState(false);
  // busy/error for the confirm (declare) submit specifically are one
  // atomic value — see confirmSubmitReducer's own comment for why: two
  // separate useState slots updated "together" are still two slots, and
  // the live preview showed busy releasing with no error ever appearing.
  // This removes that entire risk category by construction.
  const [confirmState, dispatchConfirm] = useReducer(confirmSubmitReducer, INITIAL_CONFIRM_SUBMIT_STATE);
  const confirmError = confirmState.error;
  // Belt-and-braces against a second click landing in the same tick as the
  // first, before React has re-rendered the disabled button — the same
  // ref-guard shape ProductionBuilder.tsx's own submittingRef already uses
  // for its one-shot submit path.
  const busyRef = useRef(false);
  // Discards a late-resolving confirm attempt's result if a newer attempt
  // has since started — defence-in-depth alongside busyRef, directly
  // targeting the "stale closure" failure mode named in the live-preview
  // diagnosis, even though busyRef already prevents true overlap from a
  // duplicate click.
  const confirmAttempts = useMemo(() => createAttemptTracker(), []);

  const isNonGuardian = isNonGuardianRelationship(relationship);

  const handleRequestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setEmailError('');
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await postJson('/api/builder-authority/request-code', { email: email.trim() });
      if (!result.ok) {
        setEmailError(result.error || 'Could not send a code — please try again.');
        return;
      }
      setPhase('code');
    } catch (err) {
      setEmailError(err instanceof RequestTimeoutError ? TIMEOUT_FAILURE : GENERIC_FAILURE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setCodeError('');
    if (!/^\d{6,8}$/.test(code.trim())) {
      setCodeError('Enter the code we emailed you.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await postJson('/api/builder-authority/verify-code', { email: email.trim(), code: code.trim() });
      if (!result.ok) {
        setCodeError(result.error || 'That code didn’t work — please try again.');
        return;
      }
      setPhase('details');
    } catch (err) {
      setCodeError(err instanceof RequestTimeoutError ? TIMEOUT_FAILURE : GENERIC_FAILURE);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setRelationshipError('');
    dispatchConfirm({ type: 'clear-error' });
    if (!relationship) {
      setRelationshipError('Select your relationship to the player.');
      return;
    }
    if (!confirmedAge || !confirmedPhoto || !confirmedCreation) {
      dispatchConfirm({ type: 'settle', error: 'All three confirmations are required to continue.' });
      return;
    }
    busyRef.current = true;
    const attemptId = confirmAttempts.start();
    dispatchConfirm({ type: 'start' });
    try {
      const submissionKey = await getSubmissionKey();
      const result = await postJson('/api/builder-authority/declare', {
        submissionKey,
        relationship,
        confirmedAgeAndAuthority: confirmedAge,
        confirmedPhotoPermission: confirmedPhoto,
        confirmedCardCreation: confirmedCreation,
      });
      if (!confirmAttempts.isCurrent(attemptId)) return;
      if (!result.ok) {
        dispatchConfirm({ type: 'settle', error: result.error || 'Could not save your confirmation — please try again.' });
        return;
      }
      // Only reached once the server has genuinely recorded the
      // declaration — entered relationship/confirmations are preserved on
      // every failure path above, never cleared.
      dispatchConfirm({ type: 'settle', error: '' });
      onConfirmed();
    } catch (err) {
      // getSubmissionKey() (or any other unexpected failure between here
      // and the server response) previously either propagated as an
      // unhandled rejection with zero UI feedback, or — if the underlying
      // request simply never settled — never reached this catch at all,
      // leaving "Saving…" stuck forever. fetchWithTimeout (used by both
      // postJson and ensureSubmissionKey) guarantees this catch is always
      // eventually reached.
      if (!confirmAttempts.isCurrent(attemptId)) return;
      dispatchConfirm({ type: 'settle', error: err instanceof RequestTimeoutError ? TIMEOUT_FAILURE : GENERIC_FAILURE });
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <section className="uk-wizard-panel">
      <p className="uk-wizard-kicker">Adult permission</p>
      <h1>Confirm you can create this card</h1>
      <p className="uk-wizard-copy">
        Because this card is for a young player, we need an adult to confirm they have permission.
      </p>

      <div className="uk-adult-permission-card">
        {phase === 'email' && (
          <form onSubmit={handleRequestCode}>
            <label>
              Your email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'uk-adult-email-error' : undefined}
              />
            </label>
            {emailError && <p id="uk-adult-email-error" className="uk-enquiry-error" role="alert">{emailError}</p>}
            <button type="submit" className="uk-wizard-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </form>
        )}

        {phase === 'code' && (
          <form onSubmit={handleVerifyCode}>
            <p className="uk-wizard-copy">We’ve sent a code to {email}.</p>
            <label>
              Verification code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? 'uk-adult-code-error' : undefined}
              />
            </label>
            {codeError && <p id="uk-adult-code-error" className="uk-enquiry-error" role="alert">{codeError}</p>}
            <button type="submit" className="uk-wizard-primary" disabled={busy}>
              {busy ? 'Checking…' : 'Verify code'}
            </button>
          </form>
        )}

        {phase === 'details' && (
          <form onSubmit={handleConfirm}>
            <label>
              Your relationship to the player
              <select
                value={relationship}
                onChange={(event) => {
                  setRelationship(event.target.value as BuilderAuthorityRelationship);
                  dispatchConfirm({ type: 'clear-error' });
                }}
                aria-invalid={Boolean(relationshipError)}
                aria-describedby={relationshipError ? 'uk-adult-relationship-error' : undefined}
              >
                <option value="">Select one</option>
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {relationshipError && <p id="uk-adult-relationship-error" className="uk-enquiry-error" role="alert">{relationshipError}</p>}

            {isNonGuardian && (
              <p className="uk-bgremove-note">
                A parent or legal guardian must approve this card before it can be produced.
              </p>
            )}

            <div className="uk-adult-permission-confirmations">
              <label className="uk-adult-permission-checkbox">
                <input
                  type="checkbox"
                  checked={confirmedAge}
                  onChange={(event) => {
                    setConfirmedAge(event.target.checked);
                    dispatchConfirm({ type: 'clear-error' });
                  }}
                />
                <span>{BUILDER_AUTHORITY_CONFIRMATIONS.ageAndAuthority}</span>
              </label>
              <label className="uk-adult-permission-checkbox">
                <input
                  type="checkbox"
                  checked={confirmedPhoto}
                  onChange={(event) => {
                    setConfirmedPhoto(event.target.checked);
                    dispatchConfirm({ type: 'clear-error' });
                  }}
                />
                <span>{BUILDER_AUTHORITY_CONFIRMATIONS.photoPermission}</span>
              </label>
              <label className="uk-adult-permission-checkbox">
                <input
                  type="checkbox"
                  checked={confirmedCreation}
                  onChange={(event) => {
                    setConfirmedCreation(event.target.checked);
                    dispatchConfirm({ type: 'clear-error' });
                  }}
                />
                <span>{BUILDER_AUTHORITY_CONFIRMATIONS.cardCreation}</span>
              </label>
            </div>
            {confirmError && <p className="uk-enquiry-error" role="alert">{confirmError}</p>}

            <details className="uk-adult-permission-details">
              <summary>How we use this information</summary>
              <p>
                We only use this to confirm an adult authorised this card. We never ask for identity documents or
                the player&apos;s exact date of birth, and this information is never shown publicly.
              </p>
            </details>

            <button type="submit" className="uk-wizard-primary" disabled={confirmState.busy}>
              {confirmButtonLabel(relationship, confirmState.busy)}
            </button>
          </form>
        )}

        <button type="button" className="uk-adult-permission-back" onClick={onBack} disabled={busy || confirmState.busy}>
          Back to review
        </button>
      </div>
    </section>
  );
}
