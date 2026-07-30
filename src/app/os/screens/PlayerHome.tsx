import { useOsData } from '../OsDataContext';
import { onActivateKey } from '../a11y';
import { ICN, MOMENT_STATUS_BADGE } from '../data';
import { CardFace } from '@/lib/card-definition';
import EmptyState from './EmptyState';
import type { OsActions } from '../OsApp';
import type { RealMoment, StoryUpdate } from '../osData';

/**
 * Home v1.2 — an orientation glance, not a container for the other three
 * destinations (Collection OS Product Specification v1.0). Every number
 * shown here is real: a count of actual moments, matched to a real season
 * by date range (src/lib/os-data.ts's resolveSeason), or a field already on
 * PlayerProfile/RealMoment. Never a percentage, never an invented
 * statistic, never Awards/Recognitions counts — milestone rarity includes
 * non-award firsts like "First Goal", and coach verification is a separate
 * concept from a moment's rarity tier, so deriving either would either
 * miscount or manufacture a number that isn't real.
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

/** Reused from Profile.tsx's identity card — an established decorative brand mark, not a conditional verification state. */
function VerifiedBadge() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#E97435">
      <path d="M12 1l2.5 2.2 3.3-.4 1 3.2 3 1.5-1.2 3.1 1.2 3.1-3 1.5-1 3.2-3.3-.4L12 23l-2.5-2.2-3.3.4-1-3.2-3-1.5 1.2-3.1L2.2 10l3-1.5 1-3.2 3.3.4z" />
      <path d="M9.5 12.5l1.8 1.8 3.5-3.8" stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Reused from Profile.tsx's own photo-upload icon glyph. */
function PhotoIcon(c: string) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

/** Reused from AddMomentFlow.tsx's success-indicator glyph. */
function ShieldCheckIcon(c: string) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V5z" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function BookIcon(c: string) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5z" />
    </svg>
  );
}

export default function PlayerHome({ actions, storyUpdates }: { actions: OsActions; storyUpdates: StoryUpdate[] }) {
  const { playerProfile, moments, currentSeasonStatus, cardPhotoUrl } = useOsData();
  // The single newest thing this guardian hasn't seen yet — disappears
  // from Home once opened (it becomes read), but stays visible in the full
  // Story Updates history regardless.
  const newestUnread = storyUpdates.find((u) => !u.readAt) ?? null;
  const currentSeason = playerProfile.season;
  const isSeasonOpen = currentSeasonStatus === 'active';

  const momentsThisSeason = currentSeason ? moments.filter((m) => m.seasonLabel === currentSeason) : [];
  const latestThisSeason = momentsThisSeason[0] ?? null;
  const coachVerifiedThisSeason = momentsThisSeason.filter((m) => m.status === 'coach_verified').length;
  const latestOverall = moments[0] ?? null;

  // "Player profile photo first, then card photo, then a plain initial" — deliberately the reverse
  // priority from the Card-tab glance link, per this build's explicit spec.
  const heroPhotoUrl = playerProfile.photoUrl ?? cardPhotoUrl ?? null;

  const latestMedia = latestOverall?.media.find((m) => m.kind === 'photo' || m.kind === 'video') ?? null;
  const latestBadge = latestOverall ? MOMENT_STATUS_BADGE[latestOverall.status] : null;

  return (
    <>
      {playerProfile.name && (
        <div
          onClick={actions.goCard}
          role="button"
          tabIndex={0}
          aria-label={`View ${playerProfile.name}'s card`}
          onKeyDown={onActivateKey(actions.goCard)}
          style={{ background: 'var(--os-card)', borderRadius: 20, padding: 18, cursor: 'pointer', boxShadow: '0 10px 26px -16px rgba(0,0,0,.22)', margin: '4px 2px 0' }}
        >
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ width: 76, height: 96, borderRadius: 14, flex: '0 0 auto', overflow: 'hidden', background: 'linear-gradient(160deg,#E9C46A,#C98B3A)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {heroPhotoUrl ? (
                <img src={heroPhotoUrl} alt={playerProfile.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              ) : (
                <span aria-hidden="true" style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 26, color: 'rgba(255,255,255,.95)' }}>{playerProfile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 19, color: 'var(--os-ink)' }}>{playerProfile.name.toUpperCase()}</span>
                <VerifiedBadge />
              </div>
              {(playerProfile.position || playerProfile.ageGroup) && (
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.04em', fontSize: 13.5, color: '#E97435', marginTop: 3 }}>
                  {[playerProfile.position, playerProfile.ageGroup].filter(Boolean).join(' • ')}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--os-border)', marginTop: 16, paddingTop: 12 }}>
            <div><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)', textTransform: 'uppercase' }}>Member Since</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.memberSinceYear ?? '—'}</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)', textTransform: 'uppercase' }}>Squad Number</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.squadNumber ?? '—'}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 10, color: 'var(--os-muted)', textTransform: 'uppercase' }}>Season</div><div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{playerProfile.season ?? '—'}</div></div>
          </div>
        </div>
      )}

      {newestUnread && (
        <div style={{ margin: '18px 2px 0' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 8, textTransform: 'uppercase' }}>
            What&apos;s New
          </div>
          <div
            onClick={() => actions.openStoryUpdate(newestUnread)}
            role="button"
            tabIndex={0}
            aria-label={newestUnread.title}
            onKeyDown={onActivateKey(() => actions.openStoryUpdate(newestUnread))}
            style={{ background: 'var(--os-card)', borderRadius: 16, padding: 14, cursor: 'pointer', boxShadow: '0 8px 22px -16px rgba(0,0,0,.2)', borderLeft: '3px solid #E97435' }}
          >
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)', marginBottom: 3 }}>{newestUnread.title}</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', lineHeight: 1.4 }}>{newestUnread.body}</div>
          </div>
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
            aria-label={`Latest moment: ${latestOverall.title}`}
            onKeyDown={onActivateKey(actions.goCollection)}
            style={{ display: 'flex', alignItems: 'stretch', gap: 14, background: 'linear-gradient(155deg,#1A1714,#0C0B0A)', borderRadius: 18, padding: 16, cursor: 'pointer', boxShadow: '0 16px 34px -18px rgba(0,0,0,.55)' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: RARITY_COLOR[latestOverall.rarity] }} />
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10.5, letterSpacing: '.1em', color: RARITY_COLOR[latestOverall.rarity], textTransform: 'uppercase' }}>
                  {RARITY_LABEL[latestOverall.rarity]}
                </span>
              </div>
              <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 18, color: '#F4F1EC', lineHeight: 1.15 }}>{latestOverall.title}</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 11.5, color: 'rgba(255,255,255,.55)', marginTop: 5 }}>Career Moment #{latestOverall.careerOrdinal}</div>
              {latestOverall.occurredOn && (
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>{formatMomentDate(latestOverall.occurredOn)}</div>
              )}
              {latestBadge && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,.08)' }}>
                  <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: latestBadge.dot }} />
                  <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.04em', color: 'rgba(255,255,255,.8)' }}>{latestBadge.label}</span>
                </div>
              )}
            </div>
            {latestOverall.cardDefinition ? (
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
                <CardFace data={latestOverall.cardDefinition} side="front" size={104} photoUrl={latestOverall.cardPhotoUrl} />
              </div>
            ) : latestMedia ? (
              <div style={{ flex: '0 0 auto', width: 96, borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch' }}>
                <img src={latestMedia.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div style={{ margin: '24px 2px 0' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 8, textTransform: 'uppercase' }}>
          This Season
        </div>
        {!currentSeason ? (
          <EmptyState
            title="Season not assigned yet."
            body="Season summaries will appear here once the player joins a team."
          />
        ) : momentsThisSeason.length > 0 ? (
            <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '16px 8px', boxShadow: '0 8px 20px -16px rgba(0,0,0,.2)', display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '0 6px' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>{PhotoIcon('#E97435')}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', lineHeight: 1 }}>{momentsThisSeason.length}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: 'var(--os-ink)', marginTop: 4 }}>{momentsThisSeason.length === 1 ? 'Moment' : 'Moments'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--os-muted)', marginTop: 1 }}>Recorded</div>
              </div>
              <div aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--os-border)' }} />
              <div style={{ flex: 1, textAlign: 'center', padding: '0 6px' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>{ShieldCheckIcon('#E97435')}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 20, color: 'var(--os-ink)', lineHeight: 1 }}>{coachVerifiedThisSeason}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: 'var(--os-ink)', marginTop: 4 }}>Coach-verified</div>
                <div style={{ fontSize: 10.5, color: 'var(--os-muted)', marginTop: 1 }}>{coachVerifiedThisSeason === 1 ? 'moment' : 'moments'}</div>
              </div>
              <div aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--os-border)' }} />
              <div style={{ flex: 1, textAlign: 'center', padding: '0 6px', minWidth: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>{ICN.flag('#E97435')}</div>
                <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: 'var(--os-ink)' }}>Latest</div>
                {latestThisSeason && (
                  <>
                    <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 12.5, color: '#E97435', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestThisSeason.title}</div>
                    {latestThisSeason.occurredOn && <div style={{ fontSize: 10.5, color: 'var(--os-muted)', marginTop: 1 }}>{formatMomentDate(latestThisSeason.occurredOn)}</div>}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: 'Roboto', fontSize: 14.5, color: 'var(--os-muted)', lineHeight: 1.5 }}>
              <b style={{ color: 'var(--os-ink)' }}>{currentSeason}</b> — this season is just getting started.
            </div>
          )}
        {!isSeasonOpen && currentSeason && momentsThisSeason.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--os-muted)', marginTop: 8 }}>This season has closed.</div>
        )}
      </div>

      <div
        onClick={actions.goCollection}
        role="button"
        tabIndex={0}
        aria-label="See every chapter in Collection"
        onKeyDown={onActivateKey(actions.goCollection)}
        style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--os-card)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', margin: '22px 2px 0', boxShadow: '0 8px 20px -16px rgba(0,0,0,.2)' }}
      >
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(233,116,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{BookIcon('#E97435')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>See every chapter in Collection</div>
          <div style={{ fontSize: 12, color: 'var(--os-muted)', marginTop: 1 }}>Relive every moment, milestone and memory.</div>
        </div>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--os-muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
      </div>
    </>
  );
}
