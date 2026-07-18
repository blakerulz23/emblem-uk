import { SQUAD } from '../data';
import type { OsActions } from '../OsApp';

export default function CoachTeam({ actions }: { actions: OsActions }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Curzon Ashton U10</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>14 players · 2026/27 season</div>
      </div>
      {SQUAD.map((p) => {
        const initials = p.name.split(' ').map((w) => w[0]).join('');
        return (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--os-card)', borderRadius: 16, padding: 12, boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)', marginBottom: 11 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(150deg,#E9C46A,#C98B3A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', fontFamily: 'Roboto', fontWeight: 900, fontSize: 15, color: '#fff' }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--os-muted)' }}>#{p.num} · {p.pos}</div>
            </div>
            <div onClick={() => actions.openCeleb(p.name)} style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, background: '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, padding: '10px 14px', borderRadius: 11, cursor: 'pointer', boxShadow: '0 8px 18px -10px rgba(233,116,53,.7)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>Celebrate
            </div>
          </div>
        );
      })}
    </>
  );
}
