import { osAssetPath } from '../data';
import { useOsData } from '../OsDataContext';
import EmptyState from './EmptyState';
import type { OsActions } from '../OsApp';

const SEA_C = 2 * Math.PI * 54;
const seasonPct = 0.72;

export default function PlayerHome({ actions }: { actions: OsActions }) {
  const { mode, playerProfile } = useOsData();
  const isReal = mode !== 'demo';

  const [firstName, ...rest] = playerProfile.name.split(' ');
  const lastName = rest.join(' ');

  return (
    <>
      {/* hero card */}
      <div onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ position: 'relative', background: 'var(--os-card)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px -14px rgba(0,0,0,.22)', marginBottom: 22, minHeight: 200 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 38, background: 'linear-gradient(180deg,#F26722,#C4501C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Roboto', fontWeight: 800, letterSpacing: '.2em', fontSize: 11, color: '#fff', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>EMBLEM</span>
        </div>
        <div style={{ position: 'relative', padding: '20px 52px 18px 22px', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 13, color: '#E97435', marginBottom: 2 }}>{playerProfile.position.toUpperCase()}</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 30, lineHeight: .98, color: 'var(--os-ink)' }}>{firstName.toUpperCase()}<br />{lastName.toUpperCase()}</div>
            {!isReal && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px' }}>
                <img src={`${osAssetPath}/club-badge.png`} alt={playerProfile.club} style={{ width: 26, height: 26, objectFit: 'contain', flex: '0 0 auto' }} />
                <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 12.5, color: '#6B6357' }}>{playerProfile.club}</span>
              </div>
            )}
            {isReal && playerProfile.club && (
              <div style={{ margin: '12px 0 4px', fontFamily: 'Roboto', fontWeight: 600, fontSize: 12.5, color: '#6B6357' }}>{playerProfile.club}</div>
            )}
            <div data-tiltz="30" style={{ marginTop: 14 }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, letterSpacing: '.1em', fontSize: 11, color: 'var(--os-muted)' }}>OVERALL</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 40, color: '#E97435', lineHeight: .9 }}>{playerProfile.overallScore ?? '—'}</div>
            </div>
          </div>
        </div>
        {!isReal && (
          <div data-tiltz="40" style={{ position: 'absolute', right: 38, top: 0, bottom: 0, width: 180, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={`${osAssetPath}/player-ollie.png`} alt={playerProfile.name} style={{ height: '100%', width: 'auto', objectFit: 'contain', objectPosition: 'bottom' }} />
          </div>
        )}
      </div>

      {!isReal && (
        <>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>TODAY&apos;S ACTIVITY</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)', marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>MATCH TODAY</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#E97435', fontWeight: 700, margin: '2px 0' }}>⏱ 10:30</div>
              <div style={{ fontSize: 13, color: '#6B6357' }}>vs Hyde United</div>
            </div>
            <div style={{ width: 40, height: 46, borderRadius: 6, background: 'linear-gradient(160deg,#2a2320,#12100e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 8, color: '#E23744', letterSpacing: '.04em' }}>HYDE</span>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>

          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>CURRENT CLUB</div>
          <div onClick={actions.goTeam} role="button" aria-label="View Team" tabIndex={0} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)', marginBottom: 20, cursor: 'pointer' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxShadow: '0 2px 8px -3px rgba(0,0,0,.25)' }}>
              <img src={`${osAssetPath}/club-badge.png`} alt="Curzon Ashton Juniors" style={{ width: 42, height: 42, objectFit: 'contain' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>CURZON ASHTON U10</div>
              <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Next fixture · Saturday, 10:30</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: '#E97435', flex: '0 0 auto' }}>
              View Team<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
            </span>
          </div>

          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>LATEST ACHIEVEMENT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)', marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#F6B93B,#E08A1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', boxShadow: '0 4px 10px -3px rgba(224,138,30,.6)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l3 6 6 .5-4.5 4 1.4 6.2L12 15.8 6.1 18.7 7.5 12.5 3 8.5 9 8z" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>PLAYER OF THE MATCH</div>
              <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Curzon Ashton Juniors vs Denton FC</div>
            </div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, color: 'var(--os-muted)' }}>18 MAY 2025</div></div>
          </div>

          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>CONTINUE COLLECTION</div>
          <div onClick={actions.goCollection} role="button" aria-label="Continue Collection" tabIndex={0} style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg,#1E1B18,#131110)', borderRadius: 18, padding: 18, boxShadow: '0 12px 30px -14px rgba(0,0,0,.4)', marginBottom: 20, cursor: 'pointer' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 72, height: 72, flex: '0 0 auto' }}>
                <svg width="72" height="72" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={10} />
                  <circle cx="60" cy="60" r="54" fill="none" stroke="url(#contRingGrad)" strokeWidth={10} strokeLinecap="round" strokeDasharray={SEA_C} strokeDashoffset={SEA_C * (1 - seasonPct)} />
                  <defs><linearGradient id="contRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E97435" /><stop offset="1" stopColor="#E8B23A" /></linearGradient></defs>
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: '#fff' }}>72%</span></div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 16, color: '#fff', lineHeight: 1 }}>2026 Collection</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 12.5, letterSpacing: '.03em', color: '#9A948C', marginTop: 5 }}>11 / 14 cards collected</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(150deg,#F6B93B,#E08A1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
                  </span>
                  <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.03em', color: '#C9C2B6' }}>Next: Player of the Match</span>
                </div>
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 15, padding: 11, borderRadius: 11, background: '#E97435', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 12, textTransform: 'uppercase', color: '#fff' }}>
              Continue Collection<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>

          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>SEASON PROGRESS</div>
          <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '20px 18px 18px', boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#E97435" style={{ marginBottom: 4 }}><path d="M4 4l4-2 4 2 4-2 4 2v4l-2 1v11H6V9L4 8z" /></svg>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: 'var(--os-ink)' }}>14</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', color: 'var(--os-muted)' }}>MATCHES</div>
              </div>
              <div style={{ flex: 1, borderLeft: '1px solid rgba(0,0,0,.07)', borderRight: '1px solid rgba(0,0,0,.07)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#E97435" style={{ marginBottom: 4 }}><circle cx="12" cy="12" r="10" fill="none" stroke="#E97435" strokeWidth={2} /><path d="M12 7l1.5 3H17l-2.5 2 1 3.5L12 13.5 8.5 15.5l1-3.5L7 10h3.5z" /></svg>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: 'var(--os-ink)' }}>11</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', color: 'var(--os-muted)' }}>GOALS</div>
              </div>
              <div style={{ flex: 1 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#E97435" style={{ marginBottom: 4 }}><path d="M4 16l6-9 3 4 3-2 4 9z" /></svg>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 24, color: 'var(--os-ink)' }}>5</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', color: 'var(--os-muted)' }}>ASSISTS</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, letterSpacing: '.06em', color: 'var(--os-muted)', marginBottom: 6 }}>
              <span>SEASON COMPLETION</span><span style={{ color: '#E97435' }}>63%</span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}>
              <div style={{ width: '63%', height: '100%', background: 'linear-gradient(90deg,#F26722,#E97435)', borderRadius: 6 }} />
            </div>
          </div>
        </>
      )}

      {isReal && (
        <EmptyState
          title="Your season starts here."
          body="Fixtures, achievements and memories will appear as they are added."
        />
      )}
    </>
  );
}
