import { osAssetPath } from '../data';

/**
 * The very first screen a brand-new visitor sees — card-first, per Core
 * Product Principle #2 (the physical card is the primary activation
 * method). Picking a path here determines what happens after sign-in;
 * nothing is claimed or created yet.
 */
export default function RoleFork({
  onPickCard,
  onPickNoCard,
  onPickCoach,
}: {
  onPickCard: () => void;
  onPickNoCard: () => void;
  onPickCoach: () => void;
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
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>
        WELCOME TO EMBLEM
      </div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, lineHeight: 1.1, color: '#F4F1EC', marginBottom: 28 }}>
        Every football story<br />starts somewhere.
      </div>

      <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          onClick={onPickCard}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', minHeight: 60, textAlign: 'left', background: 'rgba(233,116,53,.14)', border: '1.5px solid #E97435', borderRadius: 14, padding: '13px 18px', cursor: 'pointer', color: '#F4F1EC' }}
        >
          <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15 }}>I have a card to claim</span>
          <span style={{ fontSize: 12, color: '#B8AE9F' }}>Enter the code printed with it</span>
        </button>
        <button
          type="button"
          onClick={onPickNoCard}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', minHeight: 60, textAlign: 'left', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 18px', cursor: 'pointer', color: '#F4F1EC' }}
        >
          <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15 }}>I don&apos;t have my card</span>
          <span style={{ fontSize: 12, color: '#B8AE9F' }}>Find it using the email you bought with</span>
        </button>
        <button
          type="button"
          onClick={onPickCoach}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', minHeight: 60, textAlign: 'left', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(233,116,53,.35)', borderRadius: 14, padding: '13px 18px', cursor: 'pointer', color: '#F4F1EC' }}
        >
          <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15 }}>I&apos;m a coach setting up a team</span>
          <span style={{ fontSize: 12, color: '#B8AE9F' }}>Create your roster and cards</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24, color: 'var(--os-muted)', fontSize: 12 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8B8478" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
        </svg>
        Private &amp; secure
      </div>
    </div>
  );
}
