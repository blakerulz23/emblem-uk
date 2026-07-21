import { osAssetPath } from '../data';
import { useOsData } from '../OsDataContext';
import EmptyState from './EmptyState';
import type { OsActions } from '../OsApp';

export default function Team({ actions }: { actions: OsActions }) {
  const { mode, playerProfile } = useOsData();
  const isReal = mode !== 'demo';

  if (isReal) {
    return (
      <EmptyState
        title={playerProfile.club ? `${playerProfile.club}` : 'Your team.'}
        body="Team roster, fixtures and league standings will appear here once your club adds them."
      />
    );
  }

  return (
    <>
      <div onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -15px rgba(0,0,0,.2)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div data-tiltz="26" style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxShadow: '0 4px 12px -4px rgba(0,0,0,.25)' }}>
          <img src={`${osAssetPath}/club-badge.png`} alt="Curzon Ashton Juniors" style={{ width: 58, height: 58, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435' }}>CURRENT TEAM</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)' }}>Curzon Ashton</div>
          <div style={{ fontSize: 13, color: '#6B6357' }}>Juniors U10</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -15px rgba(0,0,0,.2)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435' }}>MANAGER</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 17, color: 'var(--os-ink)' }}>James Walker</div>
          <div style={{ fontSize: 12, color: '#6B6357', marginBottom: 6 }}>Head Coach</div>
          <div style={{ display: 'flex', gap: 14, fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: 'var(--os-muted)' }}>
            <span>Since <b style={{ color: 'var(--os-ink)', fontFamily: 'Roboto' }}>2021</b></span>
            <span>Matches <b style={{ color: 'var(--os-ink)', fontFamily: 'Roboto' }}>78</b></span>
            <span>Win <b style={{ color: 'var(--os-ink)', fontFamily: 'Roboto' }}>71%</b></span>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -15px rgba(0,0,0,.2)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: 'var(--os-ink)' }}>16</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, color: '#E97435' }}>PLAYERS</div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', border: '2px solid #fff', marginLeft: -8 }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg,#7CA98A,#3c6b4e)', border: '2px solid #fff', marginLeft: -8 }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', border: '2px solid #fff', marginLeft: -8 }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg,#8a8a8a,#444)', border: '2px solid #fff', marginLeft: -8 }} />
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.08)', border: '2px solid #fff', marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Roboto', fontWeight: 800, fontSize: 11, color: '#6B6357' }}>+11</span>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -15px rgba(0,0,0,.2)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435' }}>FIXTURES · NEXT MATCH</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 17, color: 'var(--os-ink)' }}>vs Hyde United</div>
          <div style={{ fontSize: 12, color: '#6B6357', marginTop: 2 }}>📅 Sat 18 May 2025 · 10:30 AM</div>
        </div>
        <div style={{ width: 44, height: 50, borderRadius: 6, background: 'linear-gradient(160deg,#2a2320,#12100e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 8, color: '#E23744' }}>HYDE</span>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -15px rgba(0,0,0,.2)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#E97435"><path d="M6 3h12v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM9 13h6v3H9zM7 20h10v2H7z" /></svg>
          </div>
          <div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)' }}>2nd</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, color: '#E97435' }}>LEAGUE POSITION</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', borderTop: '1px solid var(--os-border)', paddingTop: 10 }}>
          {[['P', '14'], ['W', '10'], ['D', '2'], ['L', '2'], ['GD', '+18']].map(([k, v]) => (
            <div key={k}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>{k}</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{v}</div></div>
          ))}
          <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>PTS</div><div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 14, color: '#E97435' }}>32</div></div>
        </div>
      </div>

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', margin: '0 0 10px 2px' }}>GALLERY</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <img src={`${osAssetPath}/jn-teamphoto.png`} alt="Team photo" style={{ flex: 1, width: 0, height: 66, borderRadius: 10, objectFit: 'cover' }} />
        <img src={`${osAssetPath}/jn-trophy.png`} alt="Tournament" style={{ flex: 1, width: 0, height: 66, borderRadius: 10, objectFit: 'cover' }} />
        <img src={`${osAssetPath}/jn-captain.png`} alt="Captain" style={{ flex: 1, width: 0, height: 66, borderRadius: 10, objectFit: 'cover' }} />
        <img src={`${osAssetPath}/jn-firstgoal.png`} alt="First goal" style={{ flex: 1, width: 0, height: 66, borderRadius: 10, objectFit: 'cover' }} />
      </div>
    </>
  );
}
