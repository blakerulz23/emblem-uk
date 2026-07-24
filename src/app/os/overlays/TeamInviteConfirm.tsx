'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';

export type TeamInviteLookupResult = {
  code: string;
  team: { name: string; season: string } | null;
  club: { name: string; badgeUrl: string | null } | null;
};

export type TeamInviteConfirmFields = { displayName: string };

/**
 * Mirrors ClaimConfirm.tsx's shape for a team invite instead of a
 * player claim — shows team/club name, collects the coach's own name,
 * confirms before redeeming. No "already claimed" branch here: a team
 * can have more than one coach, so redemption isn't gated on
 * exclusivity the way a physical card claim is.
 */
export default function TeamInviteConfirm({
  result,
  onConfirm,
  onBack,
}: {
  result: TeamInviteLookupResult;
  onConfirm: (fields: TeamInviteConfirmFields) => void;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState('');

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

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>
        IS THIS YOUR TEAM?
      </div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, color: '#F4F1EC', marginBottom: 8 }}>
        {result.team?.name ?? 'Your team'}
      </div>
      {result.team?.season && (
        <div style={{ fontSize: 14, color: '#B8AE9F', marginBottom: result.club ? 2 : 24 }}>{result.team.season}</div>
      )}
      {result.club && (
        <div style={{ fontSize: 14, color: '#B8AE9F', marginBottom: 24 }}>{result.club.name}</div>
      )}

      <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 15, padding: '0 16px', outline: 'none' }}
        />
        <button
          type="button"
          disabled={!displayName.trim()}
          onClick={() => onConfirm({ displayName: displayName.trim() })}
          style={{ background: displayName.trim() ? '#E97435' : 'rgba(233,116,53,.5)', color: '#0B0A09', border: 'none', borderRadius: 14, padding: '15px 30px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, cursor: displayName.trim() ? 'pointer' : 'default', boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)' }}
        >
          Yes, this is my team
        </button>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 24px', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          No, go back
        </button>
      </div>
    </div>
  );
}
