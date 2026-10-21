'use client';

import { osAssetPath } from '../data';
import BackLink from '../overlays/BackLink';

/**
 * Shown to a signed-in person with no guardian or coach relationship yet,
 * who hasn't said which they are. Writes nothing: "Parent" goes on to card
 * or invite claiming, "Coach" to a team request. The role is set later, by
 * the server, only when a claim, an invite or an approved request actually
 * creates the relationship.
 */
export default function RoleSelect({ onChoose }: { onChoose: (role: 'parent' | 'coach') => void }) {

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
      <BackLink href="/" label="Back to site" />
      <img
        src={`${osAssetPath}/emblem-wordmark.png`}
        alt="Emblem"
        style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.92, marginBottom: 40 }}
      />
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, lineHeight: 1.2, color: '#F4F1EC', marginBottom: 10 }}>
        One last thing
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 30px' }}>
        Are you a parent or guardian, or a coach?
      </p>

      <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(
          [
            { role: 'parent' as const, label: "I'm a parent / guardian", sub: 'Follow your child’s football journey' },
            { role: 'coach' as const, label: "I'm a coach", sub: 'Track and celebrate your squad' },
          ]
        ).map((opt) => (
          <button
            key={opt.role}
            type="button"
            onClick={() => onChoose(opt.role)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 3,
              width: '100%',
              minHeight: 60,
              textAlign: 'left',
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(233,116,53,.35)',
              borderRadius: 14,
              padding: '12px 18px',
              cursor: 'pointer',
              color: '#F4F1EC',
            }}
          >
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15 }}>{opt.label}</span>
            <span style={{ fontSize: 12, color: '#B8AE9F' }}>{opt.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
