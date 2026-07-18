import { osAssetPath } from '../data';
import type { OsActions } from '../OsApp';

const identity: [string, string][] = [
  ['Preferred position', 'Midfielder'],
  ['Strong foot', 'Right'],
  ['Squad number', '7'],
  ['Football age group', 'U10'],
  ['Favourite player', 'Kevin De Bruyne'],
  ['Football ambition', 'Play academy football'],
];

const goals = [
  { title: 'Keep 8 clean sheets', val: '6 / 8', valColor: '#15130F', pct: '75%', bar: 'linear-gradient(90deg,#F26722,#E97435)' },
  { title: 'Play 20 matches', val: '14 / 20', valColor: '#15130F', pct: '70%', bar: 'linear-gradient(90deg,#F26722,#E97435)' },
  { title: 'Improve distribution', val: 'In progress', valColor: '#2A6FDB', pct: '45%', bar: '#2A6FDB' },
  { title: 'Win a tournament', val: 'Completed', valColor: '#2E9E5B', pct: '100%', bar: '#2E9E5B' },
];

export default function Profile({ actions }: { actions: OsActions }) {
  return (
    <>
      <div onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ background: 'var(--os-card)', borderRadius: 20, padding: 18, boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          <div data-tiltz="26" style={{ width: 96, height: 120, borderRadius: 14, background: 'linear-gradient(160deg,#E9C46A,#C98B3A)', flex: '0 0 auto', position: 'relative', overflow: 'hidden' }}>
            <img src={`${osAssetPath}/player-ollie.png`} alt="Ollie Harrison" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: 'var(--os-ink)' }}>OLLIE HARRISON</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#E97435"><path d="M12 1l2.5 2.2 3.3-.4 1 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-1 3.2-3.3-.4L12 23l-2.5-2.2-3.3.4-1-3.2-3-1.5 1.2-3.1L2.2 10l3-1.5 1-3.2 3.3.4z" /><path d="M9.5 12.5l1.8 1.8 3.5-3.8" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 13, color: '#E97435', margin: '2px 0 8px' }}>Midfielder</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <img src={`${osAssetPath}/club-badge.png`} alt="Curzon Ashton Juniors" style={{ width: 26, height: 26, objectFit: 'contain', flex: '0 0 auto' }} />
              <div><div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: 'var(--os-ink)' }}>Curzon Ashton Juniors U10</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Manchester, England</div></div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--os-border)', borderBottom: '1px solid var(--os-border)', padding: '12px 0', marginBottom: 14 }}>
          <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>MEMBER SINCE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>2026</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SQUAD NUMBER</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>7</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>SEASON</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>2026/27</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, border: '1px solid var(--os-border)', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>Share</div>
          <div style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, background: '#E97435', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#fff' }}>Edit</div>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>CURRENT CLUB</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxShadow: '0 4px 12px -4px rgba(0,0,0,.25)' }}>
            <img src={`${osAssetPath}/club-badge.png`} alt="Curzon Ashton Juniors" style={{ width: 50, height: 50, objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>Curzon Ashton Juniors U10</div>
            <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Midfielder · Number 7</div>
          </div>
        </div>
        <div onClick={actions.goTeam} role="button" aria-label="View Club" tabIndex={0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid var(--os-border)', cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#E97435' }}>
          View Club<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>FOOTBALL IDENTITY</div>
        {identity.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ fontSize: 13.5, color: '#6B6357' }}>{k}</span>
            <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: '#E97435' }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 18, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 16 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 14 }}>2026 SEASON GOALS</div>
        {goals.map((g) => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{g.title}</span>
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: g.valColor }}>{g.val}</span>
            </div>
            <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}><div style={{ width: g.pct, height: '100%', background: g.bar, borderRadius: 5 }} /></div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 12 }}>CONNECTIONS &amp; PRIVACY</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#d9a679,#b07344)', flex: '0 0 auto' }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Managed by</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>Rebecca Penny</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Mother</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Coach access</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>James Walker</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Head Coach</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6357" strokeWidth={1.8}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Profile visibility</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>Private</div><div style={{ fontSize: 11, color: 'var(--os-muted)' }}>Approved family &amp; team only</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14, padding: 13, borderRadius: 12, background: 'rgba(233,116,53,.1)', border: '1px solid rgba(233,116,53,.3)', color: '#C4501C', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C4501C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 3 1M18 8v6M21 11h-6" /></svg>
          Invite family or coach
        </div>
      </div>
    </>
  );
}
