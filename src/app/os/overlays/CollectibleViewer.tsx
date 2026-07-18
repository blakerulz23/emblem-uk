import { MOMENT_ORDER, MOMENTS, TRUST } from '../data';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

export default function CollectibleViewer({ state, actions }: { state: OsState; actions: OsActions }) {
  const cv = state.collectible ? MOMENTS[state.collectible] : null;
  if (!cv) return null;
  const trust = TRUST[cv.trust];
  const idx = MOMENT_ORDER.indexOf(cv.id) + 1;
  const cardNo = String(idx).padStart(3, '0');
  const totalNo = String(MOMENT_ORDER.length).padStart(3, '0');
  const edition = 'Founding Collection';
  const rc = cv.reward;

  const matchDetails: [string, string][] = [
    ['Competition', 'EMJFL U10 Division One'],
    ['Opponent', rc.opp || 'Hyde United'],
    ['Score', rc.score || '3 – 1'],
    ['Date', cv.date],
    ['Venue', 'Curzon Ashton'],
  ];
  const collector: [string, string][] = [
    ['Collection', `${cv.year} First Season`],
    ['Card', `${cardNo} / ${totalNo}`],
    ['Edition', edition],
    ['Category', trust.label],
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 42, background: '#0B0A09', overflowY: 'auto', fontFamily: 'Roboto', animation: 'colExpand .42s cubic-bezier(.22,.61,.36,1)' }}>
      <div style={{ position: 'relative', height: 420 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {cv.video
            ? <video src={cv.video} poster={cv.thumb} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <img src={cv.thumb} alt={cv.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(11,10,9,.55) 0%,transparent 26%,transparent 52%,rgba(11,10,9,.96) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, border: `2px solid ${cv.rarity.color}`, opacity: .5, pointerEvents: 'none', boxShadow: 'inset 0 0 40px -10px rgba(0,0,0,.6)' }} />
        <div onClick={actions.closeCollectible} style={{ position: 'absolute', top: 16, right: 16, zIndex: 3, width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </div>
        {cv.video && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 3, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(6px)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E23744' }} /><span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.1em', color: '#fff' }}>NOW PLAYING</span>
          </div>
        )}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 24px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(11,10,9,.6)', border: `1px solid ${cv.rarity.color}` }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: cv.rarity.color }} /><span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.13em', color: '#F4E9CE' }}>{cv.rarity.label}</span></span>
            <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.13em', color: '#9C948A' }}>EDITION {cardNo} / {totalNo}</span>
          </div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 44, lineHeight: .92, textTransform: 'uppercase', color: '#fff' }}>{cv.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 12, letterSpacing: '.06em', color: '#9C948A', textTransform: 'uppercase' }}><span>{cv.year} Season</span><span>·</span><span>{edition}</span></div>
        </div>
      </div>

      <div style={{ padding: '24px 24px 40px' }}>
        <div style={{ letterSpacing: '.18em', fontSize: 11.5, fontWeight: 800, color: '#E97435', margin: '2px 0 10px' }}>MATCH SUMMARY</div>
        <p style={{ fontSize: 15, lineHeight: 1.62, color: '#CFC7B8', margin: '0 0 28px' }}>{cv.note}</p>

        <div style={{ letterSpacing: '.18em', fontSize: 11.5, fontWeight: 800, color: '#E97435', margin: '0 0 12px' }}>MATCH DETAILS</div>
        <div style={{ background: '#141210', border: '1px solid rgba(255,255,255,.06)', borderRadius: 16, padding: '4px 16px', marginBottom: 28 }}>
          {matchDetails.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.06)' }}><span style={{ fontSize: 12.5, letterSpacing: '.05em', color: '#9C948A', textTransform: 'uppercase' }}>{k}</span><span style={{ fontWeight: 700, fontSize: 13.5, color: '#F4F1EC', textAlign: 'right' }}>{v}</span></div>
          ))}
        </div>

        <div style={{ letterSpacing: '.18em', fontSize: 11.5, fontWeight: 800, color: '#E97435', margin: '0 0 12px' }}>VERIFICATION</div>
        <div style={{ background: '#141210', border: '1px solid rgba(46,158,91,.28)', borderRadius: 16, padding: 16, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(46,158,91,.14)', border: `1.5px solid ${trust.dot}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={trust.dot} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: '#F4F1EC' }}>{cv.verifiedBy}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11.5, letterSpacing: '.05em', color: '#9C948A', textTransform: 'uppercase' }}>{trust.label} · Verified {cv.date}</div>
          </div>
        </div>

        <div style={{ letterSpacing: '.18em', fontSize: 11.5, fontWeight: 800, color: '#E97435', margin: '0 0 12px' }}>COLLECTOR DETAILS</div>
        <div style={{ position: 'relative', background: 'linear-gradient(155deg,#1A1613,#100E0C)', border: '1px solid rgba(233,177,76,.28)', borderRadius: 16, padding: '18px 18px 6px', marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: '34%', left: 0, background: 'linear-gradient(90deg,transparent,rgba(233,177,76,.06),transparent)', animation: 'foilSweep 5s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E9B14C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 5.3 5.6.6-4.2 3.8 1.1 5.5L12 20.2 7.1 22.5l1.1-5.5L4 13.2l5.6-.6z" /></svg>
            <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.16em', color: '#E9B14C' }}>CERTIFICATE OF AUTHENTICITY</span>
          </div>
          {collector.map(([k, v]) => (
            <div key={k} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid rgba(255,255,255,.06)' }}><span style={{ fontSize: 12.5, letterSpacing: '.05em', color: '#9C948A', textTransform: 'uppercase' }}>{k}</span><span style={{ fontWeight: 700, fontSize: 13, color: '#F4E9CE', textAlign: 'right' }}>{v}</span></div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 16, borderRadius: 14, background: '#E97435', color: '#fff', fontWeight: 800, fontSize: 14.5, letterSpacing: '.02em', cursor: 'pointer', boxShadow: '0 12px 26px -12px rgba(233,116,53,.8)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8h16v-8" /><path d="M12 16V4" /><path d="M8 8l4-4 4 4" /></svg>Share Collectible
        </div>
        <div onClick={actions.closeCollectible} style={{ textAlign: 'center', marginTop: 14, padding: 14, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 12, letterSpacing: '.14em', color: '#9C948A', textTransform: 'uppercase', cursor: 'pointer' }}>Close · Return to Collection</div>
      </div>
    </div>
  );
}
