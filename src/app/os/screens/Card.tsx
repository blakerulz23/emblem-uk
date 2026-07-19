'use client';

import { osAssetPath } from '../data';
import { useOsData, useTopImprovements } from '../OsDataContext';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';
import SkillsTab from './card/SkillsTab';
import DevelopmentTab from './card/DevelopmentTab';
import CoachTab from './card/CoachTab';

export default function CardScreen({ state, actions }: { state: OsState; actions: OsActions }) {
  const { playerProfile: PLAYER_PROFILE } = useOsData();
  const flipHint = state.flipped ? 'Tap to see the front' : 'Tap to flip the card';
  const [firstName, ...restName] = PLAYER_PROFILE.name.split(' ');
  const lastName = restName.join(' ');
  const drivenBy = useTopImprovements(3);

  const firstGoalTeaser = (
    <div onClick={actions.openLatest} style={{ position: 'relative', overflow: 'hidden', width: 300, maxWidth: '100%', margin: '0 auto 12px', borderRadius: 14, background: 'var(--os-card)', border: '1px solid var(--os-border)', boxShadow: '0 8px 22px -14px rgba(0,0,0,.22)', padding: '12px 13px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: '34%', left: 0, background: 'linear-gradient(90deg,transparent,rgba(233,116,53,.09),transparent)', animation: 'foilSweep 4.4s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', width: 42, height: 42, borderRadius: '50%', flex: '0 0 auto', background: 'radial-gradient(circle at 32% 28%,#FCE9A8,#E8B14C 60%,#C6892E)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px -4px rgba(233,177,76,.7)' }}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="#3a2a08"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 16, color: 'var(--os-ink)', lineHeight: 1 }}>FIRST GOAL</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 999, background: 'linear-gradient(180deg,#3FB65C,#268440)' }}><span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 8.5, letterSpacing: '.1em', color: '#fff' }}>MILESTONE</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.03em', color: '#2E9E5B' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Coach Verified
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.03em', color: 'var(--os-muted)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>12 March 2026
          </span>
        </div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', flex: '0 0 auto' }}><path d="M9 5l7 7-7 7" /></svg>
    </div>
  );

  if (!state.flipped) {
    return (
      <div style={{ animation: 'faceIn .45s ease' }}>
        <div onClick={actions.flipCard} onMouseMove={actions.tiltMove} onMouseLeave={actions.tiltReset} style={{ position: 'relative', width: 300, maxWidth: '100%', margin: '14px auto 14px', borderRadius: 18, overflow: 'hidden', boxShadow: '0 26px 50px -18px rgba(0,0,0,.55)', cursor: 'pointer' }}>
          <img src={`${osAssetPath}/card-ollie-front.png`} alt="Ollie Harrison card front" style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>
        {firstGoalTeaser}
        <div onClick={actions.flipCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 6, padding: 12, borderRadius: 12, background: '#15130F', color: '#F4F1EC', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F4F1EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
          Tap to see attributes
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'faceIn .45s ease' }}>
      <div style={{ position: 'relative', background: 'var(--os-card)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px -14px rgba(0,0,0,.2)', marginBottom: 12, minHeight: 180 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
        <div style={{ position: 'relative', display: 'flex', padding: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, lineHeight: .95, color: 'var(--os-ink)' }}>{firstName.toUpperCase()}<br />{lastName.toUpperCase()}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 13, color: '#E97435', margin: '6px 0 12px' }}>{PLAYER_PROFILE.position.toUpperCase()}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#15130F' }} />
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11.5, color: '#6B6357' }}>{PLAYER_PROFILE.club.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>AGE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.age}</div></div>
              <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>HEIGHT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.height}</div></div>
              <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>FOOT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{PLAYER_PROFILE.preferredFoot.toUpperCase()}</div></div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, letterSpacing: '.06em', fontSize: 11, color: 'var(--os-muted)' }}>OVERALL</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 52, lineHeight: .85, color: '#E97435' }}>{PLAYER_PROFILE.overallScore}</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: '#2E9E5B' }}>+{PLAYER_PROFILE.seasonalChange}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 9.5, color: 'var(--os-muted)' }}>THIS SEASON</div>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, padding: '0 20px 16px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, letterSpacing: '.04em', color: 'var(--os-muted)' }}>Driven by:</span>
          {drivenBy.map((item, i) => (
            <span key={item.label} style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 11.5, color: 'var(--os-ink)' }}>
              {i > 0 && <span style={{ color: 'var(--os-muted)', marginRight: 6 }}>·</span>}
              <span style={{ color: '#2E9E5B' }}>+{item.seasonalChange}</span> {item.label}
            </span>
          ))}
        </div>
      </div>

      {firstGoalTeaser}

      <div style={{ display: 'flex', background: 'var(--os-card)', borderRadius: 14, padding: 4, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 16 }}>
        {(['Skills', 'Development', 'Coach'] as const).map((label) => {
          const on = state.ctab === label;
          return (
            <div key={label} onClick={() => actions.setCTab(label)} style={{ flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 800, fontSize: 12, letterSpacing: '.02em', background: on ? '#E97435' : 'transparent', color: on ? '#fff' : '#8A8378' }}>{label}</div>
          );
        })}
      </div>

      {state.ctab === 'Skills' && (
        <SkillsTab activeCategory={state.cat} onSelectCategory={actions.setCat} onFlipCard={actions.flipCard} flipHint={flipHint} />
      )}
      {state.ctab === 'Development' && <DevelopmentTab />}
      {state.ctab === 'Coach' && <CoachTab />}
    </div>
  );
}
