import { useOsData } from '../OsDataContext';
import { MOMENT_STATUS_BADGE } from '../data';
import { CardFace } from '@/lib/card-definition';
import type { RealMoment } from '../osData';

type SeasonGroup = { label: string; status: 'active' | 'closed' | null; items: RealMoment[] };

/** "Milestone" / "Recognized" / "Standard" — the canonical rarity vocabulary (Collection OS Product Specification v1.0), identical to demo mode's. Never "Coach Recognized"/"Memory" or any other synonym. */
const RARITY_LABEL: Record<RealMoment['rarity'], string> = {
  milestone: 'Milestone',
  recognized: 'Recognized',
  standard: 'Standard',
};
const RARITY_COLOR: Record<RealMoment['rarity'], string> = {
  milestone: '#E8B23A',
  recognized: '#E97435',
  standard: '#8A8378',
};

/** "15 Aug 2026" — never a raw ISO date string; football comes before technology. */
function formatMomentDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Moments already arrive newest-first (src/lib/os-data.ts's query order),
 * and real seasons don't overlap in time — so grouping consecutive
 * same-season entries reconstructs the chapter structure correctly with
 * no extra sort. seasonLabel/seasonStatus are computed server-side by
 * matching each moment's date against the real seasons table; nothing
 * here is a stored column.
 */
function groupBySeason(moments: RealMoment[]): SeasonGroup[] {
  const groups: SeasonGroup[] = [];
  for (const m of moments) {
    const label = m.seasonLabel ?? 'Earlier';
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(m);
    } else {
      groups.push({ label, status: m.seasonLabel ? m.seasonStatus : null, items: [m] });
    }
  }
  return groups;
}

/**
 * Collection — the complete, honestly-scaled archive of everything that
 * happened (Collection OS Product Specification v1.0). No fixed deck size,
 * no percentage, no artificial scarcity: rarity is a structural fact about
 * each moment (rarity/careerOrdinal/seasonOrdinal, computed server-side —
 * see computeRarityAndOrdinals in src/lib/os-data.ts), never a random tier
 * or a fraction of an invented total. Works identically at 3 moments or
 * 300. A closed season is a real, calendar-driven fact (seasons.status),
 * not a completion percentage — it seals into a permanent volume on the
 * shelf, it doesn't "finish" at some target count.
 */
export default function RealCollection() {
  const { moments, playerProfile } = useOsData();
  const groups = groupBySeason(moments);

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--os-muted)' }}>
          {moments.length > 0
            ? `${moments.length} ${moments.length === 1 ? 'memory' : 'memories'} in their story so far`
            : 'This season is just getting started.'}
        </div>
      </div>

      {groups.map((group, gi) => {
        const isOpenChapter = group.status === 'active';
        const isSealed = group.status === 'closed';
        return (
          <div key={`${group.label}-${gi}`} style={{ marginBottom: 26 }}>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                paddingBottom: 8, marginBottom: 12,
                borderBottom: isOpenChapter ? '1.5px dashed var(--os-border)' : '1px solid var(--os-border)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: 'var(--os-ink)' }}>{group.label}</span>
                {isSealed && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', color: 'var(--os-muted)', textTransform: 'uppercase' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                    Sealed
                  </span>
                )}
              </span>
              {isOpenChapter && (
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, letterSpacing: '.04em', fontSize: 11, color: '#E97435' }}>
                  {group.items.length} {group.items.length === 1 ? 'memory' : 'memories'} so far · still being written
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {group.items.map((m) => {
                const badge = MOMENT_STATUS_BADGE[m.status];
                const photo = m.media.find((med) => med.kind === 'photo');
                const isMilestone = m.rarity === 'milestone';
                const isRecognized = m.rarity === 'recognized';
                return (
                  <div
                    key={m.id}
                    style={{
                      background: 'var(--os-card)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: isMilestone
                        ? '0 12px 28px -12px rgba(232,177,76,.55)'
                        : isRecognized
                          ? '0 10px 26px -14px rgba(233,160,59,.45)'
                          : '0 8px 22px -16px rgba(0,0,0,.2)',
                      border: isMilestone
                        ? '1.5px solid rgba(232,177,76,.6)'
                        : isRecognized
                          ? '1.5px solid rgba(233,160,59,.4)'
                          : 'none',
                    }}
                  >
                    <div style={{ aspectRatio: '1', background: '#100E0C', position: 'relative' }}>
                      {m.cardDefinition ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CardFace data={m.cardDefinition} side="front" size={100} photoUrl={m.cardPhotoUrl} />
                        </div>
                      ) : (
                        photo && <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      {/* Rarity — a structural fact about this moment (first-of-its-kind, coach-verified, or neither), never a random tier. Same vocabulary as demo mode. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: RARITY_COLOR[m.rarity], flex: '0 0 auto' }} />
                        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 9.5, letterSpacing: '.1em', color: RARITY_COLOR[m.rarity], textTransform: 'uppercase' }}>{RARITY_LABEL[m.rarity]}</span>
                      </div>
                      {/* Title — the primary element. */}
                      <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)', lineHeight: 1.2 }}>{m.title}</div>
                      {/* Career Moment — supporting metadata: a real, ever-counting position in this player's whole history, never a fraction of a fixed total. */}
                      <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11, color: 'var(--os-muted)', marginTop: 3 }}>Career Moment #{m.careerOrdinal}</div>
                      {/* Season context — tertiary. */}
                      <div style={{ fontSize: 10.5, color: 'var(--os-muted)', marginTop: 2, opacity: .8 }}>
                        {[playerProfile.ageGroup, m.seasonLabel ?? 'Earlier', m.occurredOn ? formatMomentDate(m.occurredOn) : null].filter(Boolean).join(' • ')}
                      </div>
                      <div style={{ marginTop: 7 }}>
                        {isRecognized || isMilestone ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.03em', color: '#8A5B10', background: 'rgba(233,160,59,.18)', padding: '3px 8px', borderRadius: 999 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#E9A03B"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 18.3 5.9 20.4 7.3 13.6 2.2 8.9l6.9-.8z" /></svg>
                            {badge.label}
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.dot }} />
                            <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, color: 'var(--os-muted)' }}>{badge.label}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
