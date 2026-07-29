import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';

/**
 * Home is a lean orientation glance, not a container for the other three
 * destinations (Collection OS Product Specification v1.0). The player
 * card lives on its own permanent Card tab now — this only offers a
 * compact glance + tap-through to it, never the full object.
 *
 * Every number shown here is real — a count of actual moments, matched to
 * a real season by date range (src/lib/os-data.ts's resolveSeason). Never
 * a percentage, never an invented statistic.
 */
export default function PlayerHome({ actions }: { actions: OsActions }) {
  const { playerProfile, moments, currentSeasonStatus, cardPhotoUrl } = useOsData();
  const currentSeason = playerProfile.season;
  const isSeasonOpen = currentSeasonStatus === 'active';

  const momentsThisSeason = currentSeason ? moments.filter((m) => m.seasonLabel === currentSeason).length : 0;
  const recent = moments.slice(0, 3);
  // Prefer the Card Definition's own photo — a family whose card came
  // entirely through Builder may never have separately uploaded a guardian
  // photo (players.photo_key), so falling back to only that would show a
  // bare initial where a real photo already exists.
  const glancePhotoUrl = cardPhotoUrl ?? playerProfile.photoUrl;

  return (
    <>
      {playerProfile.name && (
        <div
          onClick={actions.goCard}
          role="button"
          tabIndex={0}
          style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 2px 0', padding: '10px 12px', borderRadius: 14, background: 'var(--os-card)', boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)', cursor: 'pointer' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flex: '0 0 auto', background: '#100E0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {glancePhotoUrl ? (
              <img src={glancePhotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: '#F4F1EC' }}>{playerProfile.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.name}</div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 12, color: 'var(--os-muted)' }}>{playerProfile.position || 'View card'}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      )}

      {currentSeason && (
        <div style={{ margin: '22px 2px 0' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 6, textTransform: 'uppercase' }}>
            Their season so far
          </div>
          {momentsThisSeason > 0 ? (
            <div style={{ fontFamily: 'Roboto', fontSize: 14.5, color: 'var(--os-ink)', lineHeight: 1.5 }}>
              <b>{currentSeason}</b> — {momentsThisSeason} {momentsThisSeason === 1 ? 'memory' : 'memories'}{' '}
              {isSeasonOpen ? 'written so far this season.' : 'were written this season.'}
            </div>
          ) : (
            <div style={{ fontFamily: 'Roboto', fontSize: 14.5, color: 'var(--os-muted)', lineHeight: 1.5 }}>
              <b style={{ color: 'var(--os-ink)' }}>{currentSeason}</b> — this season is just getting started.
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ margin: '26px 2px 4px' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 10, textTransform: 'uppercase' }}>
            Continue the story
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {recent.map((m) => {
              const photo = m.media.find((med) => med.kind === 'photo');
              return (
                <div
                  key={m.id}
                  onClick={actions.goCollection}
                  role="button"
                  tabIndex={0}
                  style={{
                    flex: '0 0 auto', width: 84, height: 84, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    background: photo ? '#100E0C' : 'var(--os-card)',
                    border: photo ? 'none' : '1px solid var(--os-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: photo ? 0 : 8,
                  }}
                >
                  {photo ? (
                    <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 11, color: 'var(--os-ink)', textAlign: 'center', lineHeight: 1.3 }}>{m.title}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div onClick={actions.goCollection} role="button" tabIndex={0} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#E97435' }}>
            See every chapter in Collection
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </div>
        </div>
      )}
    </>
  );
}
