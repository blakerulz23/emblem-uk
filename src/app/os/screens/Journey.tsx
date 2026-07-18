import { FRAME, JIC, MOMENT_ORDER, MOMENTS, TRUST } from '../data';
import type { OsActions } from '../OsApp';

const SEA_C = 2 * Math.PI * 54;
const seasonPct = 0.72;

function seal(dot: string) {
  return (
    <div style={{ width: 19, height: 19, borderRadius: '50%', background: dot, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 5px rgba(0,0,0,.45)', border: '1.5px solid rgba(255,255,255,.9)', flex: '0 0 auto' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
    </div>
  );
}

export default function Journey({ actions }: { actions: OsActions }) {
  const moments = MOMENT_ORDER.map((id) => MOMENTS[id]);
  const years = Array.from(new Set(moments.map((m) => m.year)));

  return (
    <>
      {/* SEASON COLLECTION HERO */}
      <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', marginBottom: 24, background: 'radial-gradient(125% 95% at 50% -12%,#2b2621,#0E0D0C 68%)', padding: '28px 22px 22px', boxShadow: '0 22px 46px -24px rgba(0,0,0,.75)' }}>
        <div style={{ position: 'absolute', top: -46, left: '6%', width: 130, height: 190, background: 'radial-gradient(closest-side,rgba(233,177,76,.5),transparent)', filter: 'blur(20px)', animation: 'lightPulse 4.6s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -46, right: '6%', width: 130, height: 190, background: 'radial-gradient(closest-side,rgba(233,116,53,.45),transparent)', filter: 'blur(20px)', animation: 'lightPulse 4.6s ease-in-out infinite .9s', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg,transparent 0 27px,rgba(255,255,255,.022) 27px 28px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.36em', fontSize: 12, color: '#E8B23A' }}>FIRST SEASON</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 42, lineHeight: .92, color: '#fff', marginTop: 7, letterSpacing: '-.01em' }}>2026</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, letterSpacing: '.24em', color: '#EDE7DC', marginTop: 2 }}>COLLECTION</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 20 }}>
            <div style={{ position: 'relative', width: 120, height: 120, flex: '0 0 auto' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={9} />
                <circle cx="60" cy="60" r="54" fill="none" stroke="url(#seasonRingGrad)" strokeWidth={9} strokeLinecap="round" strokeDasharray={SEA_C} strokeDashoffset={SEA_C * (1 - seasonPct)} style={{ filter: 'drop-shadow(0 0 6px rgba(233,177,76,.5))' }} />
                <defs><linearGradient id="seasonRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E97435" /><stop offset="1" stopColor="#E8B23A" /></linearGradient></defs>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 30, lineHeight: 1, color: '#fff' }}>72%</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 9.5, letterSpacing: '.11em', color: '#9A948C', marginTop: 2 }}>COMPLETE</span>
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.1em', color: '#9A948C' }}>CARDS COLLECTED</div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 26, lineHeight: 1, color: '#fff', marginTop: 2 }}>11 <span style={{ fontSize: 16, color: '#9A948C', fontWeight: 700 }}>/ 14</span></div>
              <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '14px 0' }} />
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.1em', color: '#9A948C' }}>NEXT UNLOCK</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(150deg,#F6B93B,#E08A1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
                </span>
                <div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.1 }}>Player of the Match</div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9, letterSpacing: '.12em', color: '#E97435' }}>RARE</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {years.map((year) => {
        const items = moments.filter((m) => m.year === year);
        return (
          <div key={year}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '2px 2px 14px' }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', letterSpacing: '.01em' }}>{year}</span>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.13em', color: 'var(--os-muted)', textTransform: 'uppercase' }}>Season Album · {items.length} {items.length === 1 ? 'Card' : 'Cards'}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--os-border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {items.map((m) => {
                const fr = FRAME[m.rarity.tier];
                const foil = m.rarity.tier === 'foil';
                const td = TRUST[m.trust];
                const num = `#${String(MOMENT_ORDER.indexOf(m.id) + 1).padStart(3, '0')}`;
                return (
                  <div key={m.id} className="col-card" onClick={() => actions.openCollectible(m.id)} style={{ position: 'relative', borderRadius: 15, cursor: 'pointer', background: fr.bg.replace('__C__', m.rarity.color), padding: fr.pad, boxShadow: fr.shadow }}>
                    {foil && <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '38%', left: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)', animation: 'foilSweep 3.6s ease-in-out infinite', pointerEvents: 'none', mixBlendMode: 'overlay', zIndex: 5 }} />}
                    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#100E0C' }}>
                      <div style={{ position: 'relative', height: 122 }}>
                        <img src={m.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.04) 28%,rgba(0,0,0,.68))' }} />
                        <div style={{ position: 'absolute', top: 9, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
                          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.12em', color: 'rgba(255,255,255,.9)', textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{num}</span>
                          {seal(td.dot)}
                        </div>
                        <div style={{ position: 'absolute', left: 10, bottom: 9, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>{JIC[m.ic]('#fff')}</div>
                      </div>
                      <div style={{ padding: '9px 11px 11px', background: 'linear-gradient(180deg,#1a1714,#100E0C)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.rarity.color, boxShadow: `0 0 6px ${m.rarity.color}`, flex: '0 0 auto' }} />
                          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 8.5, letterSpacing: '.12em', color: m.rarity.color }}>{m.rarity.label}</span>
                        </div>
                        <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, lineHeight: 1.12, color: '#fff' }}>{m.title}</div>
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>{m.date}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* NEXT CARD teaser */}
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', padding: 2.5, background: 'linear-gradient(140deg,rgba(59,130,246,.6),rgba(59,130,246,.14))', boxShadow: '0 14px 30px -18px rgba(59,130,246,.6)', marginBottom: 14 }}>
        <div style={{ position: 'relative', borderRadius: 13, overflow: 'hidden', background: '#0C0E14', display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <div style={{ position: 'relative', width: 74, height: 98, borderRadius: 10, overflow: 'hidden', flex: '0 0 auto', background: 'linear-gradient(160deg,#1b2536,#0c111c)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(58% 42% at 50% 32%,rgba(130,160,210,.55),transparent),linear-gradient(180deg,transparent 42%,rgba(130,160,210,.4))', filter: 'blur(6px)' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Roboto', fontWeight: 900, fontSize: 32, color: 'rgba(200,215,240,.45)' }}>?</div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%)', backgroundSize: '250% 100%', animation: 'silSheen 2.9s linear infinite' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9.5, letterSpacing: '.14em', color: '#7C99C9' }}>NEXT CARD · RARE</div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 18, color: '#fff', lineHeight: 1.05, margin: '4px 0 6px' }}>Player of the Match</div>
            <div style={{ fontFamily: 'Roboto', fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,.55)' }}>Earn it on the pitch to reveal your next collectible and grow the album.</div>
          </div>
        </div>
      </div>

      <div onClick={actions.openAdd} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'linear-gradient(150deg,#E97435,#C4501C)', borderRadius: 14, padding: 15, margin: '2px 0 14px', cursor: 'pointer', boxShadow: '0 14px 30px -14px rgba(233,116,53,.7)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: '#fff' }}>Add Memory</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(233,116,53,.09)', border: '1px solid rgba(233,116,53,.2)', borderRadius: 16, padding: 16, marginTop: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E97435', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
        </div>
        <div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>Your journey is just getting started.</div>
          <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Keep building memories, achievements and your legacy.</div>
        </div>
      </div>
    </>
  );
}
