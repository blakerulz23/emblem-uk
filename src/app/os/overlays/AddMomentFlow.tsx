import type { RefObject } from 'react';
import { ADD_ACH, ADD_EVENTS, ADD_PLAYERS, ADD_TYPES, RARITY_BY_ACH } from '../data';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

const stepTitles = ['', 'Who is it for?', 'Which match or event?', 'What happened?', 'Add the evidence', 'Ready to add'];

export default function AddMomentFlow({ state, actions, fileInputRef }: { state: OsState; actions: OsActions; fileInputRef: RefObject<HTMLInputElement> }) {
  const activeAch = ADD_ACH.find((a) => a.id === state.aAch) || ADD_ACH[0];
  const activeRarity = RARITY_BY_ACH(activeAch.rank);
  const activeEvent = ADD_EVENTS.find((e) => e.id === state.aEvent);
  const activePlayer = ADD_PLAYERS.find((p) => p.id === state.aPlayer) || ADD_PLAYERS[0];
  const photos = state.files.filter((f) => !f.isVideo).length;
  const videos = state.files.filter((f) => f.isVideo).length;
  const mediaLabel = (() => {
    const parts: string[] = [];
    if (photos) parts.push(`${photos} Photo${photos > 1 ? 's' : ''}`);
    if (videos) parts.push(`${videos} Video${videos > 1 ? 's' : ''}`);
    return parts.length ? parts.join(' · ') : 'No media attached';
  })();
  const contBg = (state.addStep === 2 && !state.aEvent) || (state.addStep === 3 && !state.aAch) ? '#C9C2B6' : '#E97435';

  return (
    <>
      {/* type picker sheet */}
      {state.addOpen && (
        <div onClick={actions.closeAdd} style={{ position: 'absolute', inset: 0, zIndex: 45, background: 'rgba(15,13,11,.55)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--os-screen)', borderRadius: '26px 26px 0 0', padding: '10px 20px 26px', maxHeight: '90%', overflowY: 'auto', animation: 'sheetUp .34s cubic-bezier(.22,.61,.36,1)' }}>
            <div style={{ width: 42, height: 5, borderRadius: 4, background: 'rgba(140,130,118,.35)', margin: '0 auto 18px' }} />
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.14em', fontSize: 22, color: 'var(--os-ink)' }}>ADD MOMENT</div>
            <div style={{ fontSize: 13.5, color: 'var(--os-muted)', margin: '4px 0 20px' }}>Capture another chapter of your football journey.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {ADD_TYPES.map((t) => (
                <div key={t.id} onClick={() => actions.pickAddType(t.id)} className="col-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 18, padding: '18px 15px', cursor: 'pointer', boxShadow: '0 8px 20px -16px rgba(0,0,0,.35)' }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{t.emoji}</span>
                  <div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14.5, color: 'var(--os-ink)', lineHeight: 1.2 }}>{t.label}</div><div style={{ fontSize: 11.5, color: 'var(--os-muted)', marginTop: 2 }}>{t.sub}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5-step wizard */}
      {state.addStep >= 1 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 48, background: 'var(--os-screen)', display: 'flex', flexDirection: 'column', fontFamily: 'Roboto' }}>
          <div style={{ flex: '0 0 auto', padding: '16px 20px 12px', borderBottom: '1px solid var(--os-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div onClick={actions.flowBack} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--os-card)', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--os-ink)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></div>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.14em', fontSize: 12, color: 'var(--os-muted)' }}>Step {state.addStep} of 5</span>
              <div onClick={actions.closeFlow} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--os-card)', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--os-ink)" strokeWidth={2.2} strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg></div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} style={{ flex: 1, height: 4, borderRadius: 3, background: n <= state.addStep ? '#E97435' : 'rgba(140,130,118,.3)', transition: 'background .3s ease' }} />
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px 16px' }}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.06em', fontSize: 24, color: 'var(--os-ink)', marginBottom: 18 }}>{stepTitles[state.addStep] || ''}</div>

            {state.addStep === 1 && ADD_PLAYERS.map((p) => {
              const sel = p.id === state.aPlayer;
              return (
                <div key={p.id} onClick={() => actions.pickAPlayer(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, background: sel ? 'rgba(233,116,53,.08)' : 'var(--os-card)', border: `1.5px solid ${sel ? '#E97435' : 'var(--os-border)'}`, borderRadius: 18, padding: 14, marginBottom: 12, cursor: 'pointer', transition: 'border-color .15s ease,background .15s ease' }}>
                  <div style={{ width: 52, height: 66, borderRadius: 11, background: p.grad, flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 5 }}><span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 15, color: 'rgba(255,255,255,.95)' }}>{p.name.split(' ').map((w) => w[0]).join('')}</span></div>
                  <div style={{ flex: 1 }}><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 16, color: 'var(--os-ink)' }}>{p.name}</div><div style={{ fontSize: 12.5, color: 'var(--os-muted)', marginTop: 2 }}>{p.team} · No. {p.num}</div></div>
                </div>
              );
            })}

            {state.addStep === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {ADD_EVENTS.map((e) => {
                  const sel = e.id === state.aEvent;
                  return (
                    <div key={e.id} onClick={() => actions.pickAEvent(e.id)} style={{ display: 'flex', flexDirection: 'column', gap: 9, background: sel ? 'rgba(233,116,53,.08)' : 'var(--os-card)', border: `1.5px solid ${sel ? '#E97435' : 'var(--os-border)'}`, borderRadius: 16, padding: '17px 15px', cursor: 'pointer', transition: 'border-color .15s ease,background .15s ease' }}>
                      <span style={{ fontSize: 26, lineHeight: 1 }}>{e.emoji}</span>
                      <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{e.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {state.addStep === 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {ADD_ACH.map((a) => {
                  const sel = a.id === state.aAch;
                  const r = RARITY_BY_ACH(a.rank);
                  return (
                    <div key={a.id} onClick={() => actions.pickAAch(a.id)} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, background: sel ? 'rgba(233,116,53,.06)' : 'var(--os-card)', border: `1.5px solid ${sel ? r.color : 'var(--os-border)'}`, borderRadius: 16, padding: '16px 14px', cursor: 'pointer', transition: 'border-color .15s ease,background .15s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 26, lineHeight: 1 }}>{a.emoji}</span><span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color }} /></div>
                      <div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)', lineHeight: 1.2 }}>{a.label}</div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 9.5, color: r.color, marginTop: 3 }}>{r.label}</div></div>
                    </div>
                  );
                })}
              </div>
            )}

            {state.addStep === 4 && (
              <>
                <div onClick={actions.pickFiles} onDragOver={actions.dragOver} onDragLeave={actions.dragLeave} onDrop={actions.dropFiles} style={{ position: 'relative', borderRadius: 18, border: `2px dashed ${state.dragging ? '#E97435' : 'rgba(233,116,53,.4)'}`, background: 'rgba(233,116,53,.05)', padding: '30px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s ease' }}>
                  <div style={{ width: 54, height: 54, borderRadius: 15, background: 'rgba(233,116,53,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M12 4l-5 5M12 4l5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
                  </div>
                  <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>Add photos or video</div>
                  <div style={{ fontSize: 12.5, color: 'var(--os-muted)', marginTop: 4 }}>Tap to browse · video optional</div>
                </div>
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={actions.onFiles} style={{ display: 'none' }} />
                {state.files.length > 0 && state.files.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 14, padding: 10, marginTop: 10 }}>
                    {f.isVideo
                      ? <div style={{ width: 46, height: 46, borderRadius: 10, background: 'linear-gradient(155deg,#2a2320,#14110e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="#E97435"><path d="M8 5v14l11-7z" /></svg></div>
                      : <img src={f.url} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: 'var(--os-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div><div style={{ fontSize: 11, color: 'var(--os-muted)', marginTop: 2 }}>{f.size}</div></div>
                    <div onClick={() => actions.removeFile(f.id)} style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(140,130,118,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={2.4} strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg></div>
                  </div>
                ))}
                <textarea onChange={actions.setDesc} value={state.aDesc} placeholder="Add a short description (optional)" style={{ width: '100%', boxSizing: 'border-box', marginTop: 14, background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 14, padding: 13, fontFamily: 'Roboto', fontSize: 13.5, color: 'var(--os-ink)', resize: 'none', minHeight: 64, outline: 'none' }} />
                <input onChange={actions.setScore} value={state.aScore} placeholder="Match score, e.g. 3 – 1 (optional)" style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: 'var(--os-card)', border: '1px solid var(--os-border)', borderRadius: 14, padding: 13, fontFamily: 'Roboto', fontSize: 13.5, color: 'var(--os-ink)', outline: 'none' }} />
              </>
            )}

            {state.addStep === 5 && (
              <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(165deg,#1A1714,#0C0B0A)', border: '1px solid rgba(255,255,255,.09)', padding: '26px 22px', boxShadow: '0 22px 50px -24px rgba(0,0,0,.6)' }}>
                <div style={{ position: 'absolute', top: 14, right: 16, fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 10, padding: '5px 10px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: `1px solid ${activeRarity.color}`, color: activeRarity.color }}>{activeRarity.label}</div>
                <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 14 }}>{activeAch.emoji}</div>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.06em', fontSize: 30, color: '#F4F1EC', lineHeight: 1 }}>{activeAch.label.toUpperCase()}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4FD07E" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5z" /><path d="M9 12l2 2 4-4" /></svg>
                  <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: '#B9F2CE' }}>Coach Verified</span>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '18px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: '#8E867B' }}>Player</span><span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#F4F1EC' }}>{activePlayer.name}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: '#8E867B' }}>Event</span><span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#F4F1EC' }}>{activeEvent?.label || 'Match'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: '#8E867B' }}>Date</span><span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#F4F1EC' }}>16 July 2026</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: '#8E867B' }}>Media</span><span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#F4F1EC' }}>{mediaLabel}</span></div>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: '0 0 auto', padding: '14px 20px 20px', borderTop: '1px solid var(--os-border)' }}>
            {state.addStep === 5 ? (
              <div onClick={actions.submitMoment} style={{ textAlign: 'center', padding: 16, borderRadius: 14, background: 'linear-gradient(150deg,#E97435,#C4501C)', color: '#fff', fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.1em', fontSize: 16, cursor: 'pointer', boxShadow: '0 14px 30px -14px rgba(233,116,53,.7)' }}>ADD TO COLLECTION</div>
            ) : (
              <div onClick={actions.flowNext} style={{ textAlign: 'center', padding: 16, borderRadius: 14, background: contBg, color: '#fff', fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.1em', fontSize: 16, cursor: 'pointer', transition: 'background .2s ease' }}>CONTINUE</div>
            )}
          </div>
        </div>
      )}

      {/* unlock sequence */}
      {state.addUnlock && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'radial-gradient(circle at 50% 32%,#231B12,#0A0908 68%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, fontFamily: 'Roboto', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from({ length: 26 }).map((_, i) => (
              <span key={i} className="conf" style={{ left: `${i * 3.8 + 2}%`, background: ['#E97435', '#E9B14C', '#3B82F6', '#4FD07E', '#A855F7'][i % 5], animationDelay: `${(i % 7) * 0.14}s`, animationDuration: `${1.4 + (i % 5) * 0.28}s` }} />
            ))}
          </div>
          <div style={{ position: 'relative', width: 190, height: 250, borderRadius: 20, background: 'linear-gradient(165deg,#1A1714,#0C0B0A)', border: `1px solid ${activeRarity.color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, boxShadow: `0 30px 60px -20px rgba(0,0,0,.7),0 0 44px -8px ${activeRarity.color}`, animation: 'unlockRise .8s cubic-bezier(.22,.61,.36,1) both' }}>
            <div style={{ position: 'absolute', top: 12, fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.14em', fontSize: 10, color: activeRarity.color }}>{activeRarity.label}</div>
            <div style={{ fontSize: 66, lineHeight: 1 }}>{activeAch.emoji}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.05em', fontSize: 22, color: '#F4F1EC', textAlign: 'center', padding: '0 14px', lineHeight: 1.05 }}>{activeAch.label.toUpperCase()}</div>
          </div>
          <div style={{ marginTop: 30, textAlign: 'center', animation: 'rowIn .6s ease .5s both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: '8px 16px', marginBottom: 18 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#C7BFB4' }}>2026 Collection</span>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 16, color: '#E97435', animation: 'counterPop .7s ease .9s both' }}>11 / 14</span>
            </div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.05em', fontSize: 26, color: '#F4F1EC', lineHeight: 1.05 }}>{activeAch.label.toUpperCase()}</div>
            <div style={{ fontSize: 13.5, color: '#9A9082', marginTop: 8, maxWidth: 260 }}>Successfully added to your 2026 Collection.</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280, marginTop: 26, animation: 'rowIn .6s ease .7s both' }}>
            <div onClick={actions.unlockViewCollection} style={{ textAlign: 'center', padding: 14, borderRadius: 13, background: 'linear-gradient(150deg,#E97435,#C4501C)', color: '#fff', fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '.1em', fontSize: 15, cursor: 'pointer' }}>VIEW COLLECTION</div>
            <div onClick={actions.unlockCreateStory} style={{ textAlign: 'center', padding: 13, borderRadius: 13, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', color: '#F4F1EC', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Create Story</div>
            <div onClick={actions.unlockReturnHome} style={{ textAlign: 'center', padding: 13, color: '#8E867B', fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Return Home</div>
          </div>
        </div>
      )}
    </>
  );
}
