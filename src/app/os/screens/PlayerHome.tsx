import { useOsData, useRefreshOsData } from '../OsDataContext';
import { onActivateKey } from '../a11y';
import { ICN, MOMENT_STATUS_BADGE } from '../data';
import { CardFace } from '@/lib/card-definition';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import { formatRelativeTime } from '../overlays/StoryUpdateCard';
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
  const { mode, playerId, playerProfile, moments, currentSeasonStatus, cardPhotoUrl } = useOsData();
  const isReal = mode !== 'demo';
  // The single newest thing this guardian hasn't seen yet — disappears
  // from Home once opened (it becomes read), but stays visible in the full
  // Story Updates history regardless.
  const newestUnread = storyUpdates.find((u) => !u.readAt) ?? null;
  const currentSeason = playerProfile.season;
  const isSeasonOpen = currentSeasonStatus === 'active';

  const momentsThisSeason = currentSeason ? moments.filter((m) => m.seasonLabel === currentSeason) : [];
  const latestThisSeason = momentsThisSeason[0] ?? null;
  const coachVerifiedThisSeason = momentsThisSeason.filter((m) => m.status === 'coach_verified').length;

  // Featured moment for the Latest Moment card: the newest moment overall
  // (moments already arrive newest-first from src/lib/os-data.ts), but
  // preferring one with media since the card design is media-dominant —
  // falls back to the true newest (using the existing no-media fallback
  // treatment) only when nothing at all has media yet.
  const featuredMoment = moments.find((m) => m.media.length > 0) ?? moments[0] ?? null;
  const featuredPhoto = featuredMoment?.media.find((m) => m.kind === 'photo' || m.kind === 'video') ?? null;
  const featuredBadge = featuredMoment ? MOMENT_STATUS_BADGE[featuredMoment.status] : null;

  // Live sync: a guardian upload, a coach verification, or a coach
  // recognition all touch the moments table — while Home is open, the
  // featured card updates itself in place (a brief highlight, never a
  // stacked "Updated just now" pill on top of it, per this section's own
  // spec) rather than requiring router.refresh().
  const refreshOsData = useRefreshOsData();
  const [justUpdated, triggerJustUpdated] = useJustUpdatedFlag();
  useLiveContent('moments', isReal && playerId ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });

  // "Player profile photo first, then card photo, then a plain initial" — deliberately the reverse
  // priority from the Card-tab glance link, per this build's explicit spec.
  const heroPhotoUrl = playerProfile.photoUrl ?? cardPhotoUrl ?? null;

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

      <div style={{ margin: '24px 2px 0' }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.1em', fontSize: 11, color: '#E97435', marginBottom: 8, textTransform: 'uppercase' }}>
          Latest Moment
        </div>
        {featuredMoment ? (
          <div
            onClick={() => actions.openLatestMoment(featuredMoment.id)}
            role="button"
            tabIndex={0}
            aria-label={`Open latest moment: ${featuredMoment.title}`}
            onKeyDown={onActivateKey(() => actions.openLatestMoment(featuredMoment.id))}
            style={{
              background: 'var(--os-card)',
              borderRadius: 20,
              overflow: 'hidden',
              cursor: 'pointer',
              border: '1.5px solid rgba(233,160,59,.35)',
              boxShadow: justUpdated ? '0 0 0 3px rgba(46,158,91,.4), 0 14px 30px -16px rgba(233,160,59,.45)' : '0 14px 30px -16px rgba(233,160,59,.3)',
              transition: 'box-shadow .4s ease',
            }}
          >
            <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#100E0C' }}>
              {featuredMoment.cardDefinition ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CardFace data={featuredMoment.cardDefinition} side="front" size={220} photoUrl={featuredMoment.cardPhotoUrl} />
                </div>
              ) : featuredPhoto ? (
                <img src={featuredPhoto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : null}

              {featuredMoment.media.length > 1 && (
                <span aria-hidden="true" style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(11,10,9,.6)', color: '#fff', fontFamily: 'Roboto', fontWeight: 700, fontSize: 10.5, padding: '3px 8px', borderRadius: 999 }}>
                  1/{featuredMoment.media.length}
                </span>
              )}

              <span aria-hidden="true" style={{ position: 'absolute', bottom: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(11,10,9,.62)', padding: '4px 9px', borderRadius: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: RARITY_COLOR[featuredMoment.rarity] }} />
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 10, letterSpacing: '.08em', color: '#fff', textTransform: 'uppercase' }}>
                  {RARITY_LABEL[featuredMoment.rarity]}
                </span>
              </span>
            </div>

            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ fontFamily: 'Roboto', fontWeight: 900, fontSize: 17, color: 'var(--os-ink)', lineHeight: 1.15 }}>{featuredMoment.title}</div>
              <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 12, color: 'var(--os-muted)', marginTop: 3 }}>Career Moment #{featuredMoment.careerOrdinal}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 }}>
                {featuredBadge && (
                  featuredMoment.status === 'coach_verified' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(233,160,59,.18)', color: '#8A5B10', fontFamily: 'Roboto', fontWeight: 700, fontSize: 11.5, padding: '5px 10px', borderRadius: 999, flex: '0 0 auto' }}>
                      {ShieldCheckIcon('#8A5B10')}
                      {featuredBadge.label}
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto' }}>
                      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: featuredBadge.dot }} />
                      <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 11, color: 'var(--os-muted)' }}>{featuredBadge.label}</span>
                    </span>
                  )
                )}
                <span style={{ fontSize: 11.5, color: 'var(--os-muted)', whiteSpace: 'nowrap' }}>
                  {formatRelativeTime(featuredMoment.occurredOn ? `${featuredMoment.occurredOn}T00:00:00` : featuredMoment.createdAt)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--os-card)', borderRadius: 18, padding: '26px 20px', textAlign: 'center', boxShadow: '0 8px 20px -16px rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 15, color: 'var(--os-ink)', marginBottom: 6 }}>No moments yet.</div>
            <div style={{ fontSize: 13, color: 'var(--os-muted)', lineHeight: 1.5, marginBottom: 14 }}>Add the first memory to begin their Collection.</div>
            <div
              onClick={actions.openAdd}
              role="button"
              tabIndex={0}
              aria-label="Add the first memory"
              onKeyDown={onActivateKey(actions.openAdd)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E97435', color: '#fff', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, padding: '10px 18px', borderRadius: 11, cursor: 'pointer' }}
            >
              + Add first memory
            </div>
          </div>
        )}
      </div>

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
