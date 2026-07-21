'use client';

import { JIC, osAssetPath } from '../data';
import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';

export default function CoachHome({ actions }: { actions: OsActions }) {
  const {
    mode,
    coachActivity: COACH_ACTIVITY,
    verifyQueue: VERIFY_QUEUE,
    coachDisplayName,
    coachClub,
    coachTeamsManaged,
  } = useOsData();
  const isReal = mode !== 'demo';
  const totalPlayers = coachTeamsManaged.reduce((sum, t) => sum + t.playerCount, 0);
  const teamsLabel = coachTeamsManaged.length === 1
    ? coachTeamsManaged[0].name
    : `${coachTeamsManaged.length} teams`;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#15130F', borderRadius: 18, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <img src={`${osAssetPath}/club-badge.png`} alt={isReal ? (coachClub?.name ?? 'Your club') : 'Curzon Ashton Juniors'} style={{ width: 42, height: 42, objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435' }}>{isReal ? (coachDisplayName ?? 'COACH').toUpperCase() : 'COACH DANNY · HEAD COACH'}</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: '#fff' }}>{isReal ? (coachClub?.name ?? 'Your club') : 'Curzon Ashton U10'}</div>
          <div style={{ fontSize: 12, color: '#9A9082' }}>{isReal ? `${totalPlayers} players · ${teamsLabel}` : '14 players · 2026/27 season'}</div>
        </div>
      </div>

      {!isReal && (
        <>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>TODAY&apos;S MATCH</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)', marginBottom: 22 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>vs Hyde United</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#E97435', fontWeight: 700, margin: '2px 0' }}>⏱ 10:30 · Home</div>
              <div style={{ fontSize: 12.5, color: '#6B6357' }}>EMJFL U10 Division One</div>
            </div>
          </div>
        </>
      )}

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>PENDING VERIFICATIONS</div>
      <div onClick={actions.goCoachVerify} role="button" aria-label="Open Verify" tabIndex={0} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 18, padding: 16, boxShadow: '0 8px 22px -14px rgba(0,0,0,.2)', marginBottom: 22, cursor: 'pointer' }}>
        <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 12, background: 'rgba(46,158,91,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{VERIFY_QUEUE.length} moments to verify</div>
          <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Parents have submitted moments for approval</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: '#E97435', flex: '0 0 auto' }}>
          Review<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
        </span>
      </div>

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>QUICK ACTIONS</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        <div onClick={actions.goCoachCelebrate} role="button" aria-label="Celebrate a player" tabIndex={0} style={{ flex: 1, background: 'linear-gradient(150deg,#E97435,#C4501C)', borderRadius: 16, padding: 16, cursor: 'pointer', boxShadow: '0 12px 26px -14px rgba(233,116,53,.7)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" style={{ marginBottom: 8 }}><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: '#fff' }}>Celebrate</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.85)', marginTop: 1 }}>Recognise a player</div>
        </div>
        <div onClick={actions.goCoachVerify} role="button" aria-label="Verify moments" tabIndex={0} style={{ flex: 1, background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 16, padding: 16, cursor: 'pointer', boxShadow: '0 8px 22px -16px rgba(0,0,0,.25)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#15130F" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>Verify</div>
          <div style={{ fontSize: 11.5, color: '#6B6357', marginTop: 1 }}>Approve moments</div>
        </div>
      </div>

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>RECENT ACTIVITY</div>
      <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '4px 16px', boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)' }}>
        {COACH_ACTIVITY.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderTop: '1px solid rgba(0,0,0,.05)' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(233,116,53,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', transform: 'scale(.82)' }}>{JIC[a.ic]('#E97435')}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--os-ink)', lineHeight: 1.35 }}>{a.text}</div>
              <div style={{ fontSize: 11, color: 'var(--os-muted)', marginTop: 2 }}>{a.when}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
