import { CELEBRATE_CATS } from '../data';
import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';
import type { OsState } from '../types';

export default function CelebrateSheet({ state, actions }: { state: OsState; actions: OsActions }) {
  const { squad } = useOsData();
  const sendBg = state.award ? '#E97435' : '#C9C2B6';
  // state.celeb holds a player id (not a display name) so the celebrate
  // API route can target a real playerId — resolve the name to show here.
  const playerName = squad.find((p) => p.id === state.celeb)?.name ?? '';
  return (
    <div onClick={actions.closeCeleb} style={{ position: 'absolute', inset: 0, zIndex: 46, background: 'rgba(15,13,11,.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: '#F4F2EE', borderRadius: '26px 26px 0 0', padding: '10px 20px 26px', maxHeight: '90%', overflowY: 'auto' }}>
        <div style={{ width: 42, height: 5, borderRadius: 4, background: 'rgba(0,0,0,.18)', margin: '0 auto 16px' }} />
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)' }}>Celebrate {playerName}</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', margin: '3px 0 16px' }}>Pick one — it&apos;s added to their journey and their family is notified.</div>
        {CELEBRATE_CATS.map((group) => (
          <div key={group.group}>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: 'var(--os-muted)', margin: '0 0 9px 2px' }}>{group.group.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {group.items.map(([label, emoji]) => {
                const on = state.award === label;
                return (
                  <div key={label} onClick={() => actions.pickAward(label)} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: on ? 'rgba(233,116,53,.12)' : '#fff', border: `1.5px solid ${on ? '#E97435' : 'rgba(0,0,0,.08)'}`, borderRadius: 15, padding: '15px 14px', cursor: 'pointer', transition: 'background .15s ease,border-color .15s ease' }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
                    <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)', lineHeight: 1.15 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: 'var(--os-muted)', margin: '0 0 8px 2px' }}>COACH MESSAGE · OPTIONAL</div>
        <textarea value={state.coachMsg} onChange={actions.setCoachMsg} placeholder="Add a message — it becomes part of their collectible." style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--os-border)', borderRadius: 14, padding: 13, fontFamily: 'Roboto', fontSize: 13.5, color: 'var(--os-ink)', background: '#fff', resize: 'none', minHeight: 64, marginBottom: 18 }} />
        <div onClick={actions.sendRecognition} style={{ textAlign: 'center', padding: 14, borderRadius: 12, background: sendBg, color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Send Recognition</div>
      </div>
    </div>
  );
}
