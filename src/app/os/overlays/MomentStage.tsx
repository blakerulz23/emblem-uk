import { JIC, MOMENTS, RANK } from '../data';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

const CIRC = 2 * Math.PI * 76;

export default function MomentStage({ state, actions }: { state: OsState; actions: OsActions }) {
  const mv = state.moment ? MOMENTS[state.moment] : null;
  if (!mv) return null;
  const rc = mv.reward;
  const rk = RANK[rc.rank];
  const pct = rc.have / rc.total;
  const heroEl = <img src={mv.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  const cardNo = String(rc.have).padStart(3, '0');
  const totalNo = String(rc.total).padStart(3, '0');
  const pctNo = Math.round(pct * 100);
  const mStage = state.mStage;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#0B0A09', overflow: 'hidden', fontFamily: 'Roboto' }}>

      {mStage === 1 && (
        <div onClick={() => actions.goStage(2)} style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}>
          <div style={{ position: 'absolute', inset: 0 }}>{heroEl}</div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(11,10,9,.82) 0%,rgba(11,10,9,.35) 38%,rgba(11,10,9,.55) 66%,rgba(11,10,9,.96) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 60% at 50% 20%,rgba(233,160,59,.28),transparent 60%)', mixBlendMode: 'screen' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.5)', animation: 'flashFade 1.1s ease forwards', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div className="ember" style={{ left: '16%', animationDuration: '3.6s', animationDelay: '.1s' }} />
            <div className="ember" style={{ left: '30%', animationDuration: '4.4s', animationDelay: '.9s', width: 5, height: 5 }} />
            <div className="ember" style={{ left: '47%', animationDuration: '3.2s', animationDelay: '.4s' }} />
            <div className="ember" style={{ left: '63%', animationDuration: '5s', animationDelay: '1.3s', width: 4, height: 4 }} />
            <div className="ember" style={{ left: '78%', animationDuration: '3.9s', animationDelay: '.2s' }} />
            <div className="ember" style={{ left: '88%', animationDuration: '4.7s', animationDelay: '.7s', width: 5, height: 5 }} />
          </div>
          <div onClick={(e) => { e.stopPropagation(); actions.closeMoment(); }} style={{ position: 'absolute', top: 16, right: 16, zIndex: 3, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
          <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column', padding: '52px 26px 30px', textAlign: 'center' }}>
            <div style={{ letterSpacing: '.34em', fontSize: 11, fontWeight: 800, color: '#F0E6D2', opacity: .9, animation: 'achIn .5s ease both' }}>ACHIEVEMENT UNLOCKED</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, lineHeight: .92, fontSize: 56, letterSpacing: '.01em', textTransform: 'uppercase', margin: '14px 0 12px', background: rk.text, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 3px 14px rgba(233,160,59,.35))', animation: 'achPop .6s cubic-bezier(.2,.8,.3,1.2) both' }}>{mv.title}</div>
            <div style={{ display: 'flex', justifyContent: 'center', animation: 'achIn .5s ease .15s both' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 999, background: rk.chip, border: '1px solid rgba(233,177,76,.4)' }}>
                <span style={{ color: '#E9B14C', fontSize: 13 }}>★</span><span style={{ letterSpacing: '.16em', fontSize: 11.5, fontWeight: 800, color: '#F4E9CE' }}>{rk.label}</span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ animation: 'achIn .55s ease .3s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 18, background: 'rgba(20,16,11,.6)', border: '1.5px solid rgba(233,177,76,.45)', backdropFilter: 'blur(8px)', boxShadow: '0 14px 40px -18px rgba(233,160,59,.6)' }}>
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ letterSpacing: '.14em', fontSize: 10, fontWeight: 800, color: '#9C948A', textTransform: 'uppercase', marginBottom: 4 }}>Added to {rc.season} Collection</div>
                  <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 30, color: '#F4E9CE', lineHeight: 1 }}>Card {cardNo} <span style={{ fontSize: 15, color: '#E9B14C' }}>/ {totalNo}</span></div>
                </div>
                <div style={{ width: 46, height: 46, borderRadius: '50%', border: '2px solid #E9B14C', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: 'rgba(233,177,76,.12)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E9B14C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
                </div>
              </div>
              <div style={{ marginTop: 16, letterSpacing: '.14em', fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase' }}>Tap to continue ↓</div>
            </div>
          </div>
        </div>
      )}

      {mStage === 2 && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 55% at 50% 0%,rgba(233,160,59,.14),transparent 55%),#0B0A09', display: 'flex', flexDirection: 'column', padding: '22px 22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onClick={actions.closeMoment} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
          </div>
          <div style={{ textAlign: 'center', letterSpacing: '.2em', fontSize: 14, fontWeight: 800, color: '#F4F1EC', margin: '6px 0 20px' }}>YOUR REWARDS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {rc.rewards.map((rd, i) => {
              const lit = rd.lit;
              return (
                <div key={i} style={{ borderRadius: 16, padding: '18px 14px', textAlign: 'center', background: lit ? 'rgba(233,177,76,.07)' : 'rgba(255,255,255,.02)', border: `1.5px solid ${lit ? 'rgba(233,177,76,.4)' : 'rgba(255,255,255,.08)'}`, animation: 'achPop .45s cubic-bezier(.2,.8,.3,1.2) both' }}>
                  <div style={{ width: 52, height: 52, margin: '0 auto 10px', borderRadius: '50%', border: '1.5px solid rgba(233,177,76,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(1.4)' }}>
                    {JIC[rd.ic](lit ? '#E9B14C' : '#6b6459')}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#F4F1EC', marginTop: 8 }}>{rd.label}</div>
                  <div style={{ fontSize: 11.5, color: '#9C948A', marginTop: 2 }}>{rd.sub}</div>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 16, background: 'rgba(20,16,11,.6)', border: '1.5px solid rgba(233,177,76,.4)', marginBottom: 14 }}>
            <div style={{ flex: 1 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 26, color: '#E9B14C', lineHeight: 1 }}>{cardNo} <span style={{ fontSize: 13 }}>/ {totalNo}</span></div><div style={{ fontSize: 10.5, letterSpacing: '.1em', color: '#9C948A', marginTop: 4, textTransform: 'uppercase' }}>Cards Collected</div></div>
            <div style={{ width: 1, background: 'rgba(255,255,255,.1)' }} />
            <div style={{ flex: 1 }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 26, color: '#F4F1EC', lineHeight: 1 }}>{pctNo}<span style={{ fontSize: 13 }}>%</span></div><div style={{ fontSize: 10.5, letterSpacing: '.1em', color: '#9C948A', marginTop: 4, textTransform: 'uppercase' }}>{rc.season} Complete</div></div>
          </div>
          <div onClick={() => actions.goStage(3)} style={{ textAlign: 'center', padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, letterSpacing: '.02em', cursor: 'pointer', boxShadow: '0 12px 26px -12px rgba(233,116,53,.8)' }}>VIEW COLLECTION →</div>
        </div>
      )}

      {mStage === 3 && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 50% at 50% 30%,rgba(233,116,53,.12),transparent 60%),#0B0A09', display: 'flex', flexDirection: 'column', padding: '22px 26px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onClick={actions.closeMoment} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
          </div>
          <div style={{ textAlign: 'center', letterSpacing: '.2em', fontSize: 14, fontWeight: 800, color: '#F4F1EC', margin: '14px 0 4px', textTransform: 'uppercase' }}>{rc.season}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 200, height: 200 }}>
              <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={12} />
                <circle cx="100" cy="100" r="76" fill="none" stroke="#E97435" strokeWidth={12} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} style={{ filter: 'drop-shadow(0 0 8px rgba(233,116,53,.6))' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 52, color: '#F4F1EC', lineHeight: .9 }}>{rc.have} <span style={{ fontSize: 26, color: '#9C948A' }}>/ {rc.total}</span></div>
                <div style={{ letterSpacing: '.16em', fontSize: 10.5, fontWeight: 800, color: '#9C948A', marginTop: 6, textTransform: 'uppercase' }}>Moments Collected</div>
              </div>
            </div>
            <p style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 1.5, color: '#9C948A', maxWidth: 230, margin: '26px 0 0' }}>Keep collecting to complete your season story.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
              {[1, 1, 1, 1, 0, 0].map((on, i) => <span key={i} style={{ fontSize: 22, color: on ? '#E9B14C' : 'rgba(255,255,255,.18)' }}>★</span>)}
            </div>
          </div>
          <div onClick={() => actions.goStage(4)} style={{ textAlign: 'center', padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 12px 26px -12px rgba(233,116,53,.8)' }}>CONTINUE →</div>
        </div>
      )}

      {mStage === 4 && (
        <div style={{ position: 'absolute', inset: 0, background: '#0B0A09', overflowY: 'auto' }}>
          <div style={{ position: 'relative', height: 230 }}>
            <div style={{ position: 'absolute', inset: 0 }}>{heroEl}</div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(11,10,9,.4),transparent 40%,rgba(11,10,9,.95))' }} />
            <div onClick={actions.prevStage} style={{ position: 'absolute', top: 14, left: 14, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none"><path d="M15 5l-7 7 7 7" /></svg></div>
            <div onClick={actions.closeMoment} style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
            <div style={{ position: 'absolute', left: 22, bottom: 16 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999, background: rk.chip, border: '1px solid rgba(233,177,76,.4)', marginBottom: 8 }}><span style={{ color: '#E9B14C', fontSize: 11 }}>★</span><span style={{ letterSpacing: '.14em', fontSize: 10.5, fontWeight: 800, color: '#F4E9CE' }}>{rk.label}</span></div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 32, color: '#fff', lineHeight: .95, textTransform: 'uppercase' }}>{mv.title}</div>
            </div>
          </div>
          <div style={{ padding: '6px 24px 28px' }}>
            <div style={{ letterSpacing: '.18em', fontSize: 12, fontWeight: 800, color: '#E97435', margin: '14px 0 8px' }}>MATCH REPORT</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#CFC7B8', margin: '0 0 22px' }}>{rc.story || mv.note}</p>
            {rc.coach && (
              <>
                <div style={{ letterSpacing: '.18em', fontSize: 12, fontWeight: 800, color: '#E97435', margin: '0 0 10px' }}>COACH NOTES</div>
                <div style={{ background: '#1C1A18', borderRadius: 16, padding: 16, border: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 13 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', flex: '0 0 auto', background: 'linear-gradient(150deg,#3a3a3a,#111)' }} />
                  <div><p style={{ fontSize: 14, lineHeight: 1.55, color: '#E7E1D6', margin: '0 0 8px', fontStyle: 'italic' }}>&quot;{rc.coach}&quot;</p><div style={{ fontSize: 12, fontWeight: 700, color: '#9C948A' }}>— {rc.coachName}</div></div>
                </div>
              </>
            )}
            {rc.facts ? (
              <div onClick={() => actions.goStage(5)} style={{ textAlign: 'center', marginTop: 22, padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>MATCH FACTS →</div>
            ) : (
              <div onClick={() => actions.goStage(6)} style={{ textAlign: 'center', marginTop: 22, padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>SHARE MY ACHIEVEMENT →</div>
            )}
          </div>
        </div>
      )}

      {mStage === 5 && rc.facts && (
        <div style={{ position: 'absolute', inset: 0, background: '#0B0A09', overflowY: 'auto', padding: '20px 22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div onClick={actions.prevStage} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none"><path d="M15 5l-7 7 7 7" /></svg></div>
            <div style={{ letterSpacing: '.2em', fontSize: 13, fontWeight: 800, color: '#F4F1EC' }}>MATCH FACTS</div>
            <div onClick={actions.closeMoment} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 22 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#9E5B22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: '#1a1206' }}>CA</div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 42, color: '#F4F1EC', lineHeight: 1 }}>{rc.score}</div><div style={{ letterSpacing: '.16em', fontSize: 10, fontWeight: 800, color: '#9C948A', marginTop: 4 }}>FULL TIME</div></div>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#4a4a4a,#151515)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 16, color: '#e6e6e6' }}>HU</div>
          </div>
          <div style={{ background: '#1C1A18', borderRadius: 16, padding: '4px 16px', border: '1px solid rgba(255,255,255,.06)', marginBottom: 20 }}>
            {rc.facts.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid rgba(255,255,255,.06)' }}><span style={{ fontSize: 12.5, letterSpacing: '.06em', color: '#9C948A', textTransform: 'uppercase' }}>{k}</span><span style={{ fontWeight: 700, fontSize: 13, color: '#F4F1EC' }}>{v}</span></div>
            ))}
          </div>
          <div style={{ letterSpacing: '.18em', fontSize: 12, fontWeight: 800, color: '#E97435', margin: '0 0 12px' }}>KEY MOMENTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 22 }}>
            {(rc.key || []).map(([m, l, i]) => (
              <div key={m + l} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0' }}>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 15, color: '#9C948A', width: 34, flex: '0 0 auto' }}>{m}</span>
                <span style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid rgba(233,116,53,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', transform: 'scale(.8)' }}>{JIC[i]('#E97435')}</span>
                <span style={{ fontSize: 13.5, color: '#E7E1D6' }}>{l}</span>
              </div>
            ))}
          </div>
          <div onClick={() => actions.goStage(6)} style={{ textAlign: 'center', padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>SHARE MY ACHIEVEMENT →</div>
        </div>
      )}

      {mStage === 6 && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 50% at 50% 20%,rgba(233,160,59,.14),transparent 55%),#0B0A09', display: 'flex', flexDirection: 'column', padding: '20px 22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div onClick={actions.prevStage} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none"><path d="M15 5l-7 7 7 7" /></svg></div>
            <div style={{ letterSpacing: '.16em', fontSize: 12.5, fontWeight: 800, color: '#F4F1EC' }}>SHARE YOUR ACHIEVEMENT</div>
            <div onClick={actions.closeMoment} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 250, borderRadius: 20, overflow: 'hidden', border: '2px solid rgba(233,177,76,.55)', boxShadow: '0 24px 60px -22px rgba(233,160,59,.7)', background: '#0B0A09' }}>
              <div style={{ position: 'relative', height: 300 }}>
                <div style={{ position: 'absolute', inset: 0 }}>{heroEl}</div>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(11,10,9,.55),transparent 30%,rgba(11,10,9,.9))' }} />
                <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ letterSpacing: '.14em', fontSize: 9, fontWeight: 800, color: '#F0E6D2', opacity: .8 }}>◆ EMBLEM</span><span style={{ letterSpacing: '.14em', fontSize: 9, fontWeight: 800, color: '#E9B14C' }}>{rk.label.split(' ')[0]}</span></div>
                <div style={{ position: 'absolute', top: 52, left: 0, right: 0, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 30, lineHeight: .9, textTransform: 'uppercase', background: rk.text, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{mv.title}</div>
                  <div style={{ letterSpacing: '.12em', fontSize: 9, fontWeight: 700, color: '#CFC7B8', marginTop: 5, textTransform: 'uppercase' }}>{rc.sub}</div>
                </div>
                <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 17, color: '#fff' }}>OLLIE HARRISON</div><div style={{ fontSize: 9, color: '#9C948A', letterSpacing: '.04em' }}>CURZON ASHTON JUNIORS U10</div></div>
                  <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 30, color: '#E9B14C' }}>7</div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '18px 0 16px' }}>
            {[
              { label: 'Story', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="#4AA3FF"><circle cx="12" cy="12" r="10" /></svg> },
              { label: 'WhatsApp', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><circle cx="12" cy="12" r="10" /></svg> },
              { label: 'Download', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F4F1EC" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg> },
              { label: 'More', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="#F4F1EC"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg> },
            ].map((it) => (
              <div key={it.label} style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: '#1C1A18', border: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.icon}</div>
                <div style={{ fontSize: 10, color: '#9C948A', marginTop: 5 }}>{it.label}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', padding: 15, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 12px 26px -12px rgba(233,116,53,.8)' }}>SHARE NOW</div>
        </div>
      )}

    </div>
  );
}
