'use client';

import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';

export default function CoachCelebrate({ actions }: { actions: OsActions }) {
  const { squad: SQUAD } = useOsData();
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Celebrate a player</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>Recognition takes seconds and lives on their journey forever.</div>
      </div>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 12, color: 'var(--os-muted)', margin: '0 0 10px 2px' }}>CHOOSE A PLAYER</div>
      {SQUAD.map((p) => {
        const initials = p.name.split(' ').map((w) => w[0]).join('');
        return (
          <div key={p.name} onClick={() => actions.openCeleb(p.name)} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--os-card)', borderRadius: 16, padding: 12, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)', marginBottom: 11, cursor: 'pointer' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 900, fontSize: 15, color: '#fff' }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--os-muted)' }}>#{p.num} · {p.pos}</div>
            </div>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B8B0A4" strokeWidth={2.2} strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>
        );
      })}
    </>
  );
}
