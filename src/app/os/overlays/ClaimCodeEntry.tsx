'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';

export type ClaimIdentity = {
  firstName: string;
  lastInitial: string;
  team: { name: string; season: string } | null;
  club: { name: string; badgeUrl: string | null } | null;
};

export type ClaimLookupResult =
  | { source: 'card' | 'invite'; code: string; alreadyClaimed: true }
  | { source: 'card' | 'invite'; code: string; alreadyClaimed: false; player: ClaimIdentity };

/**
 * Tries the code against a card claim_token first, then a guardian invite
 * code — both are "a code identifies a claimable card," just two different
 * tables, so this single entry point covers the primary card path and the
 * no-card fallback's code option with one component.
 */
export default function ClaimCodeEntry({
  onFound,
  onBack,
}: {
  onFound: (result: ClaimLookupResult) => void;
  onBack?: () => void;
}) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || status === 'loading') return;
    setStatus('loading');

    const trimmed = code.trim();
    try {
      const cardRes = await fetch(`/api/os/claim?code=${encodeURIComponent(trimmed)}`);
      const cardData = await cardRes.json();
      if (cardData.found) {
        onFound(
          cardData.alreadyClaimed
            ? { source: 'card', code: trimmed, alreadyClaimed: true }
            : { source: 'card', code: trimmed, alreadyClaimed: false, player: cardData.player }
        );
        return;
      }

      const inviteRes = await fetch(`/api/os/invites/redeem?code=${encodeURIComponent(trimmed)}`);
      const inviteData = await inviteRes.json();
      if (inviteData.found) {
        onFound({ source: 'invite', code: trimmed, alreadyClaimed: false, player: inviteData.player });
        return;
      }

      setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 30px',
        textAlign: 'center',
      }}
    >
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 40 }}
      />
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: '#F4F1EC', marginBottom: 10 }}>Enter your code</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 24px' }}>
        Printed with your Emblem card, or from an invite.
      </p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD123"
          aria-label="Claim code"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: 48,
            borderRadius: 12,
            border: '1px solid rgba(233,116,53,.35)',
            background: 'rgba(255,255,255,.04)',
            color: '#F4F1EC',
            fontFamily: 'Roboto',
            fontSize: 20,
            letterSpacing: '.25em',
            textAlign: 'center',
            padding: '0 16px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading' || !code.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: status === 'loading' ? 'rgba(233,116,53,.5)' : '#E97435',
            color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, minHeight: 48,
            padding: '15px 30px', borderRadius: 14, border: 'none',
            cursor: status === 'loading' ? 'default' : 'pointer',
            boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)',
          }}
        >
          {status === 'loading' ? 'Checking…' : 'Continue'}
        </button>
      </form>

      {status === 'error' && (
        <p role="alert" style={{ fontSize: 13, color: '#E9745C', marginTop: 14, maxWidth: 280 }}>
          That code isn&apos;t recognised — check it and try again.
        </p>
      )}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--os-muted)', fontSize: 13, marginTop: 20, cursor: 'pointer', textDecoration: 'underline' }}
        >
          Back
        </button>
      )}
    </div>
  );
}
