import { osAssetPath } from '../data';

export default function CoachProfile() {
  return (
    <>
      <div style={{ background: 'var(--os-card)', borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)' }}>Coach Danny</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 12, letterSpacing: '.05em', color: '#E97435', marginTop: 2 }}>HEAD COACH</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', color: '#2E9E5B' }}>VERIFIED COACH</span>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>CLUB</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <img src={`${osAssetPath}/club-badge.png`} alt="Curzon Ashton Juniors" style={{ width: 42, height: 42, objectFit: 'contain' }} />
          </div>
          <div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>Curzon Ashton Juniors</div><div style={{ fontSize: 12.5, color: '#6B6357' }}>Manchester, England</div></div>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '4px 18px', boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', padding: '16px 0 6px' }}>TEAMS MANAGED</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(0,0,0,.05)' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Curzon Ashton U10</span><span style={{ fontSize: 12.5, color: 'var(--os-muted)' }}>14 players</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(0,0,0,.05)' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Curzon Ashton U8</span><span style={{ fontSize: 12.5, color: 'var(--os-muted)' }}>11 players</span></div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '4px 18px', boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', padding: '16px 0 6px' }}>SETTINGS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Notifications</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)', cursor: 'pointer' }}><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--os-ink)' }}>Account</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg></div>
      </div>
    </>
  );
}
