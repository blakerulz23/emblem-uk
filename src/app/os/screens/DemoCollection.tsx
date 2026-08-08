import { FRAME, JIC, MOMENT_ORDER, MOMENTS, TRUST } from '../data';
import { onActivateKey } from '../a11y';
import { PLAYER_PROFILE } from '../playerProfile';
import type { OsActions } from '../OsApp';

function seal(dot: string) {
  return (
    <div style={{ width: 19, height: 19, borderRadius: '50%', background: dot, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 5px rgba(0,0,0,.45)', border: '1.5px solid rgba(255,255,255,.9)', flex: '0 0 auto' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
    </div>
  );
}

/** The signed-out preview of Collection — same "Career Moment #N" presentation model and rarity vocabulary as RealCollection.tsx, hand-authored content instead of real data. */
export default function DemoCollection({ actions }: { actions: OsActions }) {
  const moments = MOMENT_ORDER.map((id) => MOMENTS[id]);
  const years = Array.from(new Set(moments.map((m) => m.year)));
  const latestYear = years[years.length - 1];
  // The most recent moment gets the reveal ceremony (as if just earned);
  // every other moment opens straight into the plain browse view (as if
  // already sitting in the album) — the same two-chain distinction real
  // accounts have between /api/os/celebrate (a fresh recognition) and
  // simply reading an existing Collection entry.
  const latestId = MOMENT_ORDER[MOMENT_ORDER.length - 1];

  return (
    <>
      {/* SEASON COLLECTION HERO — a real, ever-growing count and the
          player's own real position in their history, never a ring or a
          fraction of a fixed total. The open (most recent) season reads
          as "still being written," matching RealCollection.tsx exactly. */}
      <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', marginBottom: 24, background: 'radial-gradient(125% 95% at 50% -12%,#2b2621,#0E0D0C 68%)', padding: '28px 22px 22px', boxShadow: '0 22px 46px -24px rgba(0,0,0,.75)' }}>
        <div style={{ position: 'absolute', top: -46, left: '6%', width: 130, height: 190, background: 'radial-gradient(closest-side,rgba(233,177,76,.5),transparent)', filter: 'blur(20px)', animation: 'lightPulse 4.6s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -46, right: '6%', width: 130, height: 190, background: 'radial-gradient(closest-side,rgba(233,116,53,.45),transparent)', filter: 'blur(20px)', animation: 'lightPulse 4.6s ease-in-out infinite .9s', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg,transparent 0 27px,rgba(255,255,255,.022) 27px 28px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.36em', fontSize: 12, color: '#E8B23A' }}>THEIR STORY SO FAR</div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 42, lineHeight: .92, color: '#fff', marginTop: 7, letterSpacing: '-.01em' }}>{moments.length}</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 22, letterSpacing: '.24em', color: '#EDE7DC', marginTop: 2 }}>{moments.length === 1 ? 'MEMORY' : 'MEMORIES'}</div>
          <div style={{ fontFamily: 'Roboto', fontSize: 13.5, color: '#9A948C', marginTop: 10 }}>
            Across {years.length} season{years.length === 1 ? '' : 's'} — {latestYear} is still being written.
          </div>
        </div>
      </div>

      {years.map((year) => {
        const items = moments.filter((m) => m.year === year);
        return (
          <div key={year}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '2px 2px 14px' }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', letterSpacing: '.01em' }}>{year}</span>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.13em', color: 'var(--os-muted)', textTransform: 'uppercase' }}>Season Album · {items.length} {items.length === 1 ? 'Memory' : 'Memories'}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--os-border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {items.map((m) => {
                const fr = FRAME[m.rarity.tier];
                const foil = m.rarity.tier === 'foil';
                const td = TRUST[m.trust];
                const num = `#${String(MOMENT_ORDER.indexOf(m.id) + 1).padStart(3, '0')}`;
                const isLatest = m.id === latestId;
                const openThis = () => (isLatest ? actions.openLatest() : actions.openCollectible(m.id));
                return (
                  <div key={m.id} className="col-card" onClick={openThis} role="button" tabIndex={0} aria-label={m.title} onKeyDown={onActivateKey(openThis)} style={{ position: 'relative', borderRadius: 15, cursor: 'pointer', background: fr.bg.replace('__C__', m.rarity.color), padding: fr.pad, boxShadow: fr.shadow }}>
                    {foil && <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '38%', left: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent)', animation: 'foilSweep 3.6s ease-in-out infinite', pointerEvents: 'none', mixBlendMode: 'overlay', zIndex: 5 }} />}
                    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#100E0C' }}>
                      <div style={{ position: 'relative', height: 122 }}>
                        <img src={m.thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,.04) 28%,rgba(0,0,0,.68))' }} />
                        {isLatest && (
                          <span style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', padding: '2px 9px', borderRadius: 999, background: '#E97435', fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 9, letterSpacing: '.12em', color: '#fff', zIndex: 4 }}>NEW</span>
                        )}
                        <div style={{ position: 'absolute', top: 9, left: 10, right: 10, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', zIndex: 3 }}>
                          {seal(td.dot)}
                        </div>
                        <div style={{ position: 'absolute', left: 10, bottom: 9, width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,.42)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>{JIC[m.ic]('#fff')}</div>
                      </div>
                      <div style={{ padding: '9px 11px 11px', background: 'linear-gradient(180deg,#1a1714,#100E0C)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.rarity.color, boxShadow: `0 0 6px ${m.rarity.color}`, flex: '0 0 auto' }} />
                          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 8.5, letterSpacing: '.12em', color: m.rarity.color }}>{m.rarity.label}</span>
                        </div>
                        {/* Title — primary. */}
                        <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, lineHeight: 1.12, color: '#fff' }}>{m.title}</div>
                        {/* Career Moment — supporting metadata, a real ever-counting position, never a fraction of a fixed total. */}
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, color: 'rgba(255,255,255,.65)', marginTop: 3 }}>Career Moment {num}</div>
                        {/* Season context — tertiary. */}
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 500, fontSize: 9.5, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{PLAYER_PROFILE.footballAgeGroup} • {m.date}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div onClick={actions.openAdd} role="button" tabIndex={0} onKeyDown={onActivateKey(actions.openAdd)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'linear-gradient(150deg,#E97435,#C4501C)', borderRadius: 14, padding: 15, margin: '2px 0 14px', cursor: 'pointer', boxShadow: '0 14px 30px -14px rgba(233,116,53,.7)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: '#fff' }}>Add Memory</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(233,116,53,.09)', border: '1px solid rgba(233,116,53,.2)', borderRadius: 16, padding: 16, marginTop: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E97435', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
        </div>
        <div>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>Their story is just getting started.</div>
          <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 2 }}>Keep building memories, achievements and their legacy.</div>
        </div>
      </div>
    </>
  );
}
