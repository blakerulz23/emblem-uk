import { ATTR, CAT_META, osAssetPath } from '../data';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

export default function CardScreen({ state, actions }: { state: OsState; actions: OsActions }) {
  const attrs = (ATTR[state.cat] || ATTR.Attacking).map(([name, value, delta]) => ({ name, value, delta, pct: `${value}%` }));
  const attrScore = Math.round(attrs.reduce((s, a) => s + a.value, 0) / attrs.length);
  const flipHint = state.flipped ? 'Tap to see the front' : 'Tap to flip the card';

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
      <div style={{ position: 'relative', background: 'var(--os-card)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px -14px rgba(0,0,0,.2)', marginBottom: 16, minHeight: 180 }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(115deg,transparent 0 22px,rgba(233,116,53,.05) 22px 24px)' }} />
        <div style={{ position: 'relative', display: 'flex', padding: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, lineHeight: .95, color: 'var(--os-ink)' }}>OLLIE<br />HARRISON</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 13, color: '#E97435', margin: '6px 0 12px' }}>MIDFIELDER</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#15130F' }} />
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11.5, color: '#6B6357' }}>CURZON ASHTON<br />JUNIORS U10</span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>AGE</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>10</div></div>
              <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>HEIGHT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>1.42m</div></div>
              <div style={{ borderLeft: '1px solid var(--os-border)', paddingLeft: 16 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)' }}>FOOT</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>RIGHT</div></div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, letterSpacing: '.06em', fontSize: 11, color: 'var(--os-muted)' }}>OVERALL</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 52, lineHeight: .85, color: '#E97435' }}>87</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: '#2E9E5B' }}>+5</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 9.5, color: 'var(--os-muted)' }}>THIS SEASON</div>
          </div>
        </div>
      </div>

      {firstGoalTeaser}

      <div style={{ display: 'flex', background: 'var(--os-card)', borderRadius: 14, padding: 4, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 16 }}>
        {(['Attributes', 'Development', 'Coach'] as const).map((label) => {
          const on = state.ctab === label;
          return (
            <div key={label} onClick={() => actions.setCTab(label)} style={{ flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 800, fontSize: 12, letterSpacing: '.02em', background: on ? '#E97435' : 'transparent', color: on ? '#fff' : '#8A8378' }}>{label}</div>
          );
        })}
      </div>

      {state.ctab === 'Attributes' && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: '0 0 96px' }}>
            {CAT_META.map(([label, emoji]) => {
              const on = state.cat === label;
              return (
                <div key={label} onClick={() => actions.setCat(label)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 9px', borderRadius: 11, cursor: 'pointer', marginBottom: 7, background: on ? 'rgba(233,116,53,.1)' : '#fff' }}>
                  <span style={{ fontSize: 14 }}>{emoji}</span>
                  <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, letterSpacing: '.04em', color: on ? '#E97435' : '#6B6357' }}>{label}</span>
                </div>
              );
            })}
            <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 12, background: 'var(--os-card)', boxShadow: '0 6px 16px -13px rgba(0,0,0,.25)', marginTop: 4 }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 9.5, color: 'var(--os-muted)' }}>ATTRIBUTE SCORE</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, color: '#E97435' }}>{attrScore}</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9, letterSpacing: '.06em', color: '#6B6357' }}>TOP 12%<br />IN LEAGUE</div>
            </div>
            <div onClick={actions.flipCard} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, padding: '10px 6px', borderRadius: 11, cursor: 'pointer', background: '#15130F', color: '#F4F1EC', fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.08em', fontSize: 10, textTransform: 'uppercase' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F4F1EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              {flipHint}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            {attrs.map((at) => (
              <div key={at.name} style={{ background: 'var(--os-card)', borderRadius: 13, padding: '12px 13px', boxShadow: '0 5px 14px -12px rgba(0,0,0,.25)', marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: 'var(--os-ink)' }}>{at.name}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: 'var(--os-ink)' }}>{at.value}</span>
                    <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, color: '#2E9E5B' }}>↑{at.delta}</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}><div style={{ width: at.pct, height: '100%', background: 'linear-gradient(90deg,#F26722,#E97435)', borderRadius: 5 }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.ctab === 'Development' && (
        <>
          <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 18, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 12, color: 'var(--os-muted)', marginBottom: 16 }}>FOOTBALL DEVELOPMENT</div>
            {[{ season: '26/27', rating: 87, pct: '87%' }, { season: '25/26', rating: 82, pct: '82%' }, { season: '24/25', rating: 76, pct: '76%' }].map((pg) => (
              <div key={pg.season} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 12, color: 'var(--os-muted)', width: 56, flex: '0 0 auto' }}>{pg.season}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}><div style={{ width: pg.pct, height: '100%', background: 'linear-gradient(90deg,#F26722,#E97435)' }} /></div>
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 16, color: 'var(--os-ink)', width: 30, textAlign: 'right' }}>{pg.rating}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, background: 'var(--os-card)', borderRadius: 16, padding: 16, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)' }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, color: 'var(--os-muted)', marginBottom: 12 }}>MOST IMPROVED</div>
              {[{ name: 'Passing', delta: '+5' }, { name: 'Vision', delta: '+6' }, { name: 'Decision Making', delta: '+4' }].map((mi) => (
                <div key={mi.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{mi.name}</span>
                  <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#2E9E5B' }}>{mi.delta}</span>
                </div>
              ))}
            </div>
            <div style={{ flex: '0 0 118px', background: 'var(--os-card)', borderRadius: 16, padding: 16, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 11, color: 'var(--os-muted)', marginBottom: 6 }}>COACH RATING</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 34, color: '#E97435', lineHeight: 1 }}>8.7</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: '#6B6357', marginTop: 2 }}>out of 10</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9.5, letterSpacing: '.05em', color: '#2E9E5B' }}>VERIFIED</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(233,116,53,.08)', border: '1px solid rgba(233,116,53,.2)', borderRadius: 16, padding: 15, marginTop: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1.5px solid #E97435', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#E97435' }}>KEEP IMPROVING</div>
              <div style={{ fontSize: 12, color: '#6B6357', lineHeight: 1.45, marginTop: 2 }}>Passing and vision have improved the most this season. Keep working on movement off the ball and decision-making under pressure.</div>
            </div>
          </div>
        </>
      )}

      {state.ctab === 'Coach' && (
        <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 22, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.09em', fontSize: 12, color: '#E97435', marginBottom: 14 }}>COACH REVIEW</div>
          <p style={{ fontFamily: 'Roboto', fontStyle: 'italic', fontSize: 16, lineHeight: 1.5, color: '#2A241D', margin: '0 0 16px' }}>&quot;Ollie&apos;s passing and vision have come on leaps this season. A composed midfielder who reads the game beautifully and lifts everyone around him.&quot;</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: '1px solid var(--os-border)', marginBottom: 16 }}>
            <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: 'var(--os-ink)' }}>James Walker</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: 'var(--os-muted)' }}>HEAD COACH · CURZON ASHTON</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9.5, letterSpacing: '.05em', color: '#2E9E5B' }}>VERIFIED</span>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color: '#2E9E5B', marginBottom: 4 }}>WHAT IMPROVED</div><div style={{ fontSize: 12.5, color: '#4A423A', lineHeight: 1.45 }}>Passing range and vision — now dictating the tempo from midfield.</div></div>
          <div style={{ marginBottom: 12 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color: '#E97435', marginBottom: 4 }}>WORK ON NEXT</div><div style={{ fontSize: 12.5, color: '#4A423A', lineHeight: 1.45 }}>Movement off the ball and decision-making under pressure.</div></div>
          <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color: 'var(--os-muted)', marginBottom: 4 }}>CURRENT STRENGTHS</div><div style={{ fontSize: 12.5, color: '#4A423A', lineHeight: 1.45 }}>Composure, game intelligence and leadership.</div></div>
        </div>
      )}
    </div>
  );
}
