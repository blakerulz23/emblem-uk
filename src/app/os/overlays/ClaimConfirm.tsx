'use client';

import { osAssetPath } from '../data';
import type { ClaimLookupResult } from './ClaimCodeEntry';

/**
 * Shows only the minimum necessary identity before authentication — first
 * name + surname initial, team/club — never age, date of birth, or private
 * media. An already-claimed card discloses nothing at all: the tightened
 * multi-guardian rule means a second person with the same physical code
 * can't see who it belongs to, only that it's already active.
 */
export default function ClaimConfirm({
  result,
  onConfirm,
  onBack,
}: {
  result: ClaimLookupResult;
  onConfirm: () => void;
  onBack: () => void;
}) {
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
            <button
              type="button"
              onClick={onConfirm}
              style={{ background: '#E97435', color: '#0B0A09', border: 'none', borderRadius: 14, padding: '15px 30px', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)' }}
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
