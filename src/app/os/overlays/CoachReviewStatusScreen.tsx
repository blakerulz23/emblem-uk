'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';
import { createClient } from '@/lib/supabase/client';
import { COACH_REVIEW_SCREEN_BODY, COACH_REVIEW_SCREEN_NOT_PAUSED, COACH_REVIEW_SCREEN_PAUSED, COACH_REVIEW_SCREEN_TITLE } from '@/lib/account-deletion-copy';
import { signOutToStart } from '@/lib/coach-review-status';

/** The real Sign out: end the Supabase session, then load the signed-out /os start screen. */
export function signOutFromReviewScreen(): Promise<void> {
  return signOutToStart({ signOut: () => createClient().auth.signOut(), navigate: (path) => window.location.assign(path) });
}

/**
 * Shown by ActivationGate to a signed-in, coach-only account whose deletion
 * request is under staff review (see showsCoachReviewScreen). Status and Sign
 * out only: it changes nothing about the review itself.
 */
export default function CoachReviewStatusScreen({
  coachAccessPaused = true,
  onSignOut,
}: {
  /** False for a coach account that had no coach access to pause (e.g. only a team request). */
  coachAccessPaused?: boolean;
  /** Injected in tests; defaults to the real sign-out and a hard navigation to /os. */
  onSignOut?: () => Promise<void>;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await (onSignOut ?? signOutFromReviewScreen)();
  };

  return (
    <section
      aria-labelledby="coach-review-title"
      style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 30px', textAlign: 'center', overflowY: 'auto' }}
    >
      <img src={`${osAssetPath}/emblem-wordmark.png`} alt="Emblem" style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 36 }} />
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>ACCOUNT DELETION REQUEST</div>
      <h1 id="coach-review-title" style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 25, lineHeight: 1.12, color: '#F4F1EC', margin: '0 0 14px' }}>
        {COACH_REVIEW_SCREEN_TITLE}
      </h1>
      <div role="status" style={{ maxWidth: 320 }}>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#D8CFC2', margin: '0 0 12px' }}>{COACH_REVIEW_SCREEN_BODY}</p>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', margin: '0 0 28px' }}>{coachAccessPaused ? COACH_REVIEW_SCREEN_PAUSED : COACH_REVIEW_SCREEN_NOT_PAUSED}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        style={{ minWidth: 200, minHeight: 48, padding: '13px 28px', borderRadius: 14, border: 'none', background: '#E97435', color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, cursor: signingOut ? 'default' : 'pointer', opacity: signingOut ? 0.7 : 1 }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  );
}
