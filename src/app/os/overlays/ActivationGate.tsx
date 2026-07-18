import { osAssetPath } from '../data';

export default function ActivationGate({ onActivate }: { onActivate: () => void }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, background: 'radial-gradient(120% 80% at 50% 0%,#211b16 0%,#0f0c0a 55%,#0a0908 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 30px', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130, background: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
      <img src={`${osAssetPath}/emblem-wordmark.png`} alt="Emblem" style={{ height: 30, width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: .92, marginBottom: 40 }} />
      <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 34 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.5)', animation: 'actRing 2.2s ease-out infinite' }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.4)', animation: 'actRing 2.2s ease-out .7s infinite' }} />
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.3)', animation: 'actRing 2.2s ease-out 1.4s infinite' }} />
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(233,116,53,.14)', border: '1.5px solid rgba(233,116,53,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5a8 8 0 0 1 0 7M10 6a13 13 0 0 1 0 12M14 4a17 17 0 0 1 0 16" /></svg>
        </div>
      </div>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.18em', fontSize: 12, color: '#E97435', marginBottom: 12 }}>WELCOME TO EMBLEM</div>
      <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 27, lineHeight: 1.08, color: '#F4F1EC', marginBottom: 12 }}>Every football story<br />starts somewhere.</div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: '#B8AE9F', maxWidth: 280, margin: '0 0 32px' }}>Tap your Emblem card to the back of your phone to unlock Ollie&apos;s living football journey.</p>
      <div onClick={onActivate} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#E97435', color: '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, padding: '15px 30px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 16px 34px -16px rgba(233,116,53,.8)' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0B0A09" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8.5a8 8 0 0 1 0 7M10 6a13 13 0 0 1 0 12M14 4a17 17 0 0 1 0 16" /></svg>
        Tap to activate
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, color: 'var(--os-muted)', fontSize: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B8478" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /></svg>
        Private &amp; secure · you become the owner
      </div>
    </div>
  );
}
