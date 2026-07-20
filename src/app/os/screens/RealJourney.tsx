import { useOsData } from '../OsDataContext';
import { TRUST } from '../data';

const EMPTY_SLOT_COUNT = 6;

/**
 * The real Collection view — deliberately plain, not the demo's cinematic
 * MomentStage/CollectibleViewer experience. Real submitted moments only
 * ever have {title, date, note, photo/video, trust}, none of the rich
 * hand-authored rarity/rewards/narrative fields those components assume,
 * so this stays a separate, simpler sibling rather than trying to force
 * real data through UI built for curated demo content.
 */
export default function RealJourney() {
  const { moments } = useOsData();

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 22, color: 'var(--os-ink)', lineHeight: 1.1 }}>Collection</div>
        <div style={{ fontSize: 13, color: 'var(--os-muted)', marginTop: 4 }}>
          {moments.length > 0 ? `${moments.length} verified moment${moments.length === 1 ? '' : 's'}` : 'Your first verified moment will appear here.'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {moments.map((m) => {
          const trust = TRUST[m.trust];
          const photo = m.media.find((med) => med.kind === 'photo');
          return (
            <div
              key={m.id}
              style={{
                background: 'var(--os-card)',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)',
              }}
            >
              <div style={{ aspectRatio: '1', background: '#100E0C', position: 'relative' }}>
                {photo && (
                  <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, color: 'var(--os-ink)' }}>{m.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: trust?.dot ?? '#8A8378' }} />
                  <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10.5, color: 'var(--os-muted)' }}>{trust?.label ?? m.trust}</span>
                </div>
                {m.occurredOn && (
                  <div style={{ fontSize: 11, color: 'var(--os-muted)', marginTop: 3 }}>{m.occurredOn}</div>
                )}
              </div>
            </div>
          );
        })}

        {Array.from({ length: Math.max(0, EMPTY_SLOT_COUNT - moments.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            style={{
              aspectRatio: '0.8',
              borderRadius: 16,
              border: '1.5px dashed var(--os-border)',
              background: 'rgba(0,0,0,.015)',
            }}
          />
        ))}
      </div>
    </>
  );
}
