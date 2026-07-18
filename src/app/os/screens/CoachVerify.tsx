import { VERIFY_QUEUE } from '../data';

export default function CoachVerify() {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Verify moments</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>Approved moments receive the Coach Verified badge.</div>
      </div>
      {VERIFY_QUEUE.map((v) => (
        <div key={v.player + v.moment} style={{ background: 'var(--os-card)', borderRadius: 18, padding: 14, boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flex: '0 0 auto', position: 'relative', background: '#100E0C' }}>
              <img src={v.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)' }}>{v.moment}</div>
              <div style={{ fontSize: 12.5, color: '#6B6357', marginTop: 1 }}>{v.player}</div>
              <div style={{ fontSize: 11.5, color: 'var(--os-muted)', marginTop: 3 }}>Submitted by {v.by} · {v.date}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: 11, borderRadius: 11, background: '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 8px 18px -10px rgba(233,116,53,.7)' }}>Approve</div>
            <div style={{ flex: '0 0 auto', textAlign: 'center', padding: '11px 16px', borderRadius: 11, border: '1px solid var(--os-border)', color: '#6B6357', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Changes</div>
            <div style={{ flex: '0 0 auto', textAlign: 'center', padding: '11px 16px', borderRadius: 11, border: '1px solid rgba(210,60,50,.3)', color: '#C0392B', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Reject</div>
          </div>
        </div>
      ))}
    </>
  );
}
