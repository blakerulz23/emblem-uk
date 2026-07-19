import { COACH_SUMMARY } from '../../playerProfile';

export default function CoachTab() {
  const c = COACH_SUMMARY;

  return (
    <div style={{ background: 'var(--os-card)', borderRadius: 16, padding: 22, boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(150deg,#3a3a3a,#111)', flex: '0 0 auto' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{c.name}</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: 'var(--os-muted)' }}>{c.role.toUpperCase()} · {c.club.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: '#E97435', lineHeight: 1 }}>{c.rating}</div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 9.5, color: 'var(--os-muted)' }}>OUT OF 10</div>
        </div>
      </div>

      {c.verified && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18, padding: '5px 11px', borderRadius: 999, background: 'rgba(46,158,91,.1)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', color: '#2E9E5B' }}>COACH VERIFIED</span>
        </div>
      )}

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color: '#E97435', marginBottom: 6 }}>LATEST FEEDBACK</div>
      <p style={{ fontFamily: 'Roboto', fontStyle: 'italic', fontSize: 15, lineHeight: 1.55, color: '#2A241D', margin: '0 0 20px' }}>&quot;{c.latestFeedback}&quot;</p>

      <ListBlock title="STRENGTHS" items={c.strengths} color="#2E9E5B" />
      <ListBlock title="CURRENT FOCUS" items={c.currentFocus} color="#E97435" />
      <ListBlock title="PLAYING STYLE" items={c.playingStyle} color="var(--os-muted)" />

      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color: 'var(--os-muted)', margin: '4px 0 12px' }}>SEASON TARGETS</div>
      {c.seasonTargets.map((t) => {
        const pct = Math.min(100, Math.round((t.current / t.target) * 100));
        return (
          <div key={t.label} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 600, fontSize: 13, color: 'var(--os-ink)' }}>{t.label}</span>
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: t.status === 'completed' ? '#2E9E5B' : 'var(--os-ink)' }}>
                {t.status === 'completed' ? 'Completed' : `${t.current} of ${t.target}`}
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 5, background: 'rgba(0,0,0,.07)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: t.status === 'completed' ? '#2E9E5B' : 'linear-gradient(90deg,#F26722,#E97435)', borderRadius: 5 }} />
            </div>
          </div>
        );
      })}

      <div style={{ fontSize: 11.5, color: 'var(--os-muted)', marginTop: 4 }}>Last reviewed by {c.name} · {c.lastReviewed}</div>
    </div>
  );
}

function ListBlock({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.06em', fontSize: 10.5, color, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((item) => (
          <span key={item} style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12.5, color: 'var(--os-ink)', background: 'rgba(0,0,0,.05)', borderRadius: 999, padding: '6px 12px' }}>{item}</span>
        ))}
      </div>
    </div>
  );
}
