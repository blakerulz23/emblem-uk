import { onActivateKey } from '../../a11y';
import { COACH_SUMMARY, findSkill } from '../../playerProfile';

export default function SkillDetailSheet({ skillId, onClose }: { skillId: string; onClose: () => void }) {
  const found = findSkill(skillId);
  if (!found) return null;
  const { skill } = found;

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(15,13,11,.55)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.label} detail`}
        style={{ width: '100%', background: 'var(--os-screen)', borderRadius: '26px 26px 0 0', padding: '10px 20px 28px', maxHeight: '86%', overflowY: 'auto', animation: 'sheetUp .34s cubic-bezier(.22,.61,.36,1)' }}
      >
        <div style={{ width: 42, height: 5, borderRadius: 4, background: 'rgba(140,130,118,.35)', margin: '0 auto 18px' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)' }}>{skill.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
              <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 30, color: '#E97435', lineHeight: 1 }}>{skill.score}</span>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 13, color: '#2E9E5B' }}>+{skill.seasonalChange} this season</span>
            </div>
          </div>
          <div
            onClick={onClose}
            role="button"
            tabIndex={0}
            aria-label="Close"
            onKeyDown={onActivateKey(onClose)}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--os-card)', border: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 auto' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--os-ink)" strokeWidth={2.2} strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '16px 0 22px' }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: 'var(--os-muted)', textTransform: 'uppercase' }}>Coach confidence</span>
          <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{skill.coachConfidence}</span>
        </div>

        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 12, textTransform: 'uppercase' }}>Why this score</div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)', marginBottom: 8 }}>Match evidence</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {skill.evidence.map((item) => (
              <li key={item} style={{ fontSize: 13.5, color: 'var(--os-muted)', lineHeight: 1.55, marginBottom: 5 }}>{item}</li>
            ))}
          </ul>
        </div>

        {skill.coachComments.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)', marginBottom: 8 }}>Coach feedback</div>
            {skill.coachComments.map((comment) => (
              <p key={comment} style={{ fontFamily: 'Roboto', fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.55, color: '#4A423A', margin: '0 0 8px' }}>&quot;{comment}&quot;</p>
            ))}
          </div>
        )}

        {skill.recognitions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13.5, color: 'var(--os-ink)', marginBottom: 8 }}>Recognitions</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {skill.recognitions.map((r) => (
                <li key={r} style={{ fontSize: 13.5, color: 'var(--os-muted)', lineHeight: 1.55, marginBottom: 4 }}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2E9E5B" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11.5, letterSpacing: '.05em', color: '#2E9E5B', textTransform: 'uppercase' }}>Verified by {COACH_SUMMARY.name}</span>
        </div>
      </div>
    </div>
  );
}
