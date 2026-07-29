import { useOsData } from '../OsDataContext';
import type { OsActions } from '../OsApp';
import type { RealMoment } from '../osData';

/**
 * Home is a lean orientation glance, not a container for the other three
 * destinations (Collection OS Product Specification v1.0). The player
 * card lives on its own permanent Card tab now — this only offers a
 * compact glance + tap-through to it, never the full object.
 *
 * Every number shown here is real — a count of actual moments, matched to
 * a real season by date range (src/lib/os-data.ts's resolveSeason). Never
 * a percentage, never an invented statistic. Deliberately does not surface
 * "Awards"/"Recognitions" as counted stats — milestone rarity includes
 * things like "First Goal" that aren't awards, and coach verification is a
 * separate concept from moment significance; inventing a count that
 * conflates either would be exactly the kind of manufactured-looking
 * number this product exists to avoid.
 */

/** Same rarity vocabulary/colors as Collection (RealCollection.tsx) — reused, not reinvented. */
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

function formatMomentDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlayerHome({ actions }: { actions: OsActions }) {
  const { playerProfile, moments, currentSeasonStatus } = useOsData();
  const currentSeason = playerProfile.season;
  const isSeasonOpen = currentSeasonStatus === 'active';

  const momentsThisSeason = currentSeason ? moments.filter((m) => m.seasonLabel === currentSeason) : [];
  const latestThisSeason = momentsThisSeason[0] ?? null;
  const coachVerifiedThisSeason = momentsThisSeason.filter((m) => m.status === 'coach_verified').length;
  const latestOverall = moments[0] ?? null;

  return (
    <>
      {playerProfile.name && (
        <div
          onClick={actions.goCard}
          role="button"
          tabIndex={0}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 2px 0', padding: '2px 2px', cursor: 'pointer' }}
        >
          <div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 21, color: 'var(--os-ink)', lineHeight: 1.15 }}>{playerProfile.name}</div>
            {(playerProfile.position || playerProfile.ageGroup) && (
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.04em', fontSize: 13, color: '#E97435', marginTop: 2 }}>
                {[playerProfile.position, playerProfile.ageGroup].filter(Boolean).join(' • ')}
              </div>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </div>
      )}

      {latestOverall && (
        <div style={{ margin: '24px 2px 0' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 8, textTransform: 'uppercase' }}>
            Latest Moment
          </div>
          <div
            onClick={actions.goCollection}
            role="button"
            tabIndex={0}
            style={{ background: 'var(--os-card)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', boxShadow: '0 6px 16px -12px rgba(0,0,0,.2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: RARITY_COLOR[latestOverall.rarity] }} />
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.1em', color: RARITY_COLOR[latestOverall.rarity], textTransform: 'uppercase' }}>
                {RARITY_LABEL[latestOverall.rarity]}
              </span>
            </div>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15.5, color: 'var(--os-ink)' }}>{latestOverall.title}</div>
            {latestOverall.occurredOn && (
              <div style={{ fontSize: 12.5, color: 'var(--os-muted)', marginTop: 3 }}>{formatMomentDate(latestOverall.occurredOn)}</div>
            )}
          </div>
        </div>
      )}

      {currentSeason && (
        <div style={{ margin: '24px 2px 0' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 6, textTransform: 'uppercase' }}>
            This Season
          </div>
          {momentsThisSeason.length > 0 ? (
            <div style={{ fontFamily: 'Roboto', fontSize: 14.5, color: 'var(--os-ink)', lineHeight: 1.7 }}>
              <div><b>{momentsThisSeason.length}</b> {momentsThisSeason.length === 1 ? 'Moment' : 'Moments'}</div>
              {latestThisSeason && <div>Latest: <b>{latestThisSeason.title}</b></div>}
              <div>
                <b>{coachVerifiedThisSeason}</b> {coachVerifiedThisSeason === 1 ? 'Coach-verified moment' : 'Coach-verified moments'}
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: 'Roboto', fontSize: 14.5, color: 'var(--os-muted)', lineHeight: 1.5 }}>
              <b style={{ color: 'var(--os-ink)' }}>{currentSeason}</b> — this season is just getting started.
            </div>
          )}
          {!isSeasonOpen && momentsThisSeason.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--os-muted)', marginTop: 4 }}>This season has closed.</div>
          )}
        </div>
      )}

      <div
        onClick={actions.goCollection}
        role="button"
        tabIndex={0}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 22, cursor: 'pointer', fontFamily: 'Roboto', fontWeight: 700, fontSize: 13, color: '#E97435' }}
      >
        See every chapter in Collection
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E97435" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
      </div>
    </>
  );
}
