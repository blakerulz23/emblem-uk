'use client';

import { useState } from 'react';
import { BUILDER_CSRF_HEADER, readBuilderCsrfCookie } from '@/lib/print-capture';
import {
  BUILDER_AUTHORITY_CONFIRMATIONS,
  type BuilderAuthorityRelationship,
} from '@/lib/builder-authority-shared';

type Phase = 'email' | 'code' | 'details';

const RELATIONSHIP_OPTIONS: { value: BuilderAuthorityRelationship; label: string }[] = [
  { value: 'parent_guardian', label: 'Parent or legal guardian' },
  { value: 'coach', label: 'Coach' },
  { value: 'club_organiser', label: 'Club organiser' },
  { value: 'other_adult', label: 'Another adult' },
];

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    return { ok: false, error: result?.error || 'Something went wrong — please try again.' };
  }
  return result;
}

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
  const [confirmError, setConfirmError] = useState('');
  const [busy, setBusy] = useState(false);

  const isNonGuardian = relationship === 'coach' || relationship === 'club_organiser' || relationship === 'other_adult';

  const handleRequestCode = async () => {
    setEmailError('');
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const result = await postJson('/api/builder-authority/request-code', { email: email.trim() });
      if (!result.ok) {
        setEmailError(result.error || 'Could not send a code — please try again.');
        return;
      }
      setPhase('code');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    setCodeError('');
    if (!/^\d{6,8}$/.test(code.trim())) {
      setCodeError('Enter the code we emailed you.');
      return;
    }
    setBusy(true);
    try {
      const result = await postJson('/api/builder-authority/verify-code', { email: email.trim(), code: code.trim() });
      if (!result.ok) {
        setCodeError(result.error || 'That code didn’t work — please try again.');
        return;
      }
      setPhase('details');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setRelationshipError('');
    setConfirmError('');
    if (!relationship) {
      setRelationshipError('Select your relationship to the player.');
      return;
    }
    if (!confirmedAge || !confirmedPhoto || !confirmedCreation) {
      setConfirmError('All three confirmations are required to continue.');
      return;
    }
    setBusy(true);
    try {
      const submissionKey = await getSubmissionKey();
      const result = await postJson('/api/builder-authority/declare', {
        submissionKey,
        relationship,
        confirmedAgeAndAuthority: confirmedAge,
        confirmedPhotoPermission: confirmedPhoto,
        confirmedCardCreation: confirmedCreation,
      });
      if (!result.ok) {
        setConfirmError(result.error || 'Could not save your confirmation — please try again.');
        return;
      }
      onConfirmed();
    } finally {
      setBusy(false);
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
          <>
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
            <button type="button" className="uk-wizard-primary" onClick={handleRequestCode} disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </>
        )}

        {phase === 'code' && (
          <>
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
            <button type="button" className="uk-wizard-primary" onClick={handleVerifyCode} disabled={busy}>
              {busy ? 'Checking…' : 'Verify code'}
            </button>
          </>
        )}

        {phase === 'details' && (
          <>
            <label>
              Your relationship to the player
              <select
                value={relationship}
                onChange={(event) => setRelationship(event.target.value as BuilderAuthorityRelationship)}
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
                <input type="checkbox" checked={confirmedAge} onChange={(event) => setConfirmedAge(event.target.checked)} />
                <span>{BUILDER_AUTHORITY_CONFIRMATIONS.ageAndAuthority}</span>
              </label>
              <label className="uk-adult-permission-checkbox">
                <input type="checkbox" checked={confirmedPhoto} onChange={(event) => setConfirmedPhoto(event.target.checked)} />
                <span>{BUILDER_AUTHORITY_CONFIRMATIONS.photoPermission}</span>
              </label>
              <label className="uk-adult-permission-checkbox">
                <input type="checkbox" checked={confirmedCreation} onChange={(event) => setConfirmedCreation(event.target.checked)} />
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

            <button type="button" className="uk-wizard-primary" onClick={handleConfirm} disabled={busy}>
              {busy ? 'Saving…' : 'Approve and continue'}
            </button>
          </>
        )}

        <button type="button" className="uk-adult-permission-back" onClick={onBack} disabled={busy}>
          Back to review
        </button>
      </div>
    </section>
  );
}
