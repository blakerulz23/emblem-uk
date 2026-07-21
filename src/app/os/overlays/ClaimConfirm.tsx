'use client';

import { useState } from 'react';
import { osAssetPath } from '../data';
import type { ClaimLookupResult } from './ClaimCodeEntry';

export type ClaimConfirmFields = { displayName: string; relationship: string };

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Other'];

/**
 * Shows only the minimum necessary identity before authentication — first
 * name + surname initial, team/club — never age, date of birth, or private
 * media. An already-claimed card discloses nothing at all: the tightened
 * multi-guardian rule means a second person with the same physical code
 * can't see who it belongs to, only that it's already active.
 *
 * Also collects the guardian's own name + relationship here — the one
 * place both the card-claim and invite-redeem paths already converge —
 * so "Managed by [real name]" has an actual name to show later.
 */
export default function ClaimConfirm({
  result,
  onConfirm,
  onBack,
}: {
  result: ClaimLookupResult;
  onConfirm: (fields: ClaimConfirmFields) => void;
  onBack: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0]);

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

      {result.alreadyClaimed ? (
        <>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: '#F4F1EC', marginBottom: 10 }}>
            This card&apos;s already active
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 24px' }}>
            Ask the existing guardian to invite you from inside the app instead.
          </p>
          <button
            type="button"
            onClick={onBack}
            style={{ background: 'none', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 24px', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Try a different code
          </button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>
            IS THIS YOUR CHILD?
          </div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, color: '#F4F1EC', marginBottom: 8 }}>
            {result.player.firstName} {result.player.lastInitial}.
          </div>
          {result.player.team && (
            <div style={{ fontSize: 14, color: '#B8AE9F', marginBottom: result.player.club ? 2 : 24 }}>
              {result.player.team.name} · {result.player.team.season}
            </div>
          )}
          {result.player.club && (
            <div style={{ fontSize: 14, color: '#B8AE9F', marginBottom: 24 }}>{result.player.club.name}</div>
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
            <select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              aria-label="Your relationship to this player"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 12, border: '1px solid rgba(233,116,53,.35)', background: 'rgba(255,255,255,.04)', color: '#F4F1EC', fontFamily: 'Roboto', fontSize: 15, padding: '0 16px', outline: 'none' }}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r} style={{ background: '#15130F' }}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!displayName.trim()}
              onClick={() => onConfirm({ displayName: displayName.trim(), relationship })}
              style={{ background: displayName.trim() ? '#E97435' : 'rgba(233,116,53,.5)', color: '#0B0A09', border: 'none', borderRadius: 14, padding: '15px 30px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, cursor: displayName.trim() ? 'pointer' : 'default', boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)' }}
            >
              Yes, this is my child
            </button>
            <button
              type="button"
              onClick={onBack}
              style={{ background: 'none', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 24px', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              No, try a different code
            </button>
          </div>
        </>
      )}
    </div>
  );
}
