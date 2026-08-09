import { useEffect, useRef, useState } from 'react';
import { useOsData, useRefreshOsData } from '../OsDataContext';
import { MOMENT_STATUS_BADGE } from '../data';
import { CardFace } from '@/lib/card-definition';
import { usePresenceHeartbeat } from '../usePresenceHeartbeat';
import { useLiveContent, useJustUpdatedFlag } from '../useLiveContent';
import { onActivateKey } from '../a11y';
import MomentMediaViewer from '../overlays/MomentMediaViewer';
import { MomentThumbnail } from '../overlays/MomentThumbnail';
import { toMomentMediaItem, type RealMoment } from '../osData';

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
export default function RealCollection({
  highlightMomentId,
  onHighlightDone,
}: { highlightMomentId?: string | null; onHighlightDone?: () => void } = {}) {
  const { moments, playerProfile, playerId } = useOsData();
  const groups = groupBySeason(moments);

  // View-only media viewer, opened from a card's own photo/video area —
  // entirely local state, same pattern as Coach Verify (production-tested)
  // and PlayerHome. One trigger ref per moment id so focus returns to the
  // exact card that opened the viewer, not a blanket "first card."
  const [expandedMomentId, setExpandedMomentId] = useState<string | null>(null);
  const mediaTriggerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const closeMediaViewer = (id: string) => {
    setExpandedMomentId((current) => (current === id ? null : current));
    mediaTriggerRefs.current[id]?.focus();
  };
  const expandedMoment = expandedMomentId ? moments.find((m) => m.id === expandedMomentId) ?? null : null;

  // A Story Update deep-link (recognition/moment_verified) lands on this
  // tab and asks for one real moment's card to be scrolled-to and briefly
  // highlighted — Collection stays the single destination for football
  // memories, never a second per-moment detail screen.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightMomentId) return;
    cardRefs.current.get(highlightMomentId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setActiveHighlight(highlightMomentId);
    const timeout = setTimeout(() => {
      setActiveHighlight(null);
      onHighlightDone?.();
    }, 2500);
    return () => clearTimeout(timeout);
  }, [highlightMomentId, onHighlightDone]);

  // Being mounted here IS being on the Collection tab — Recognition and
  // Coach-Verified events happening right now appear in this grid
  // immediately (via refreshOsData(), never router.refresh()), and the
  // presence heartbeat this keeps alive is what tells
  // src/lib/story-updates.ts the resulting Story Update was already seen
  // live, not missed.
  const refreshOsData = useRefreshOsData();
  const [justUpdated, triggerJustUpdated] = useJustUpdatedFlag();
  usePresenceHeartbeat(playerId ? `collection:${playerId}` : null);
  useLiveContent('moments', playerId ? `player_id=eq.${playerId}` : null, () => {
    refreshOsData();
    triggerJustUpdated();
  });

  // Guardian-only control over an individual moment's public visibility —
  // the one missing piece identified by the public-visibility audit. Calls
  // the existing, already-authorized PATCH /api/os/moments/[id]/visibility
  // route unchanged; refreshOsData() (the same helper the live-content
  // subscription above already uses) re-fetches the full OsData snapshot on
  // success so the flipped badge appears immediately, without a page
  // reload — no new client-side data-fetching pattern introduced.
  const [visibilityBusyId, setVisibilityBusyId] = useState<string | null>(null);
  const [visibilityErrorId, setVisibilityErrorId] = useState<string | null>(null);
  const setMomentVisibility = async (momentId: string, visibility: 'private' | 'public') => {
    setVisibilityBusyId(momentId);
    setVisibilityErrorId(null);
    try {
      const res = await fetch(`/api/os/moments/${momentId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) {
        setVisibilityErrorId(momentId);
        return;
      }
      await refreshOsData();
    } catch {
      setVisibilityErrorId(momentId);
    } finally {
      setVisibilityBusyId(null);
    }
  };

  return (
    <>
      {justUpdated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 12, animation: 'faceIn .3s ease' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9E5B' }} />
          <span style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 12, color: '#2E9E5B' }}>Updated just now</span>
        </div>
      )}
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
                // Widened from photo-only — a video-only moment previously
                // rendered no thumbnail at all here (RealCollection never
                // picked up video media for the card preview, unlike
                // PlayerHome's equivalent card, which already considers
                // both kinds).
                const previewMedia = m.media.find((med) => med.kind === 'photo' || med.kind === 'video');
                const isMilestone = m.rarity === 'milestone';
                const isRecognized = m.rarity === 'recognized';
                const isHighlighted = activeHighlight === m.id;
                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(m.id, el);
                      else cardRefs.current.delete(m.id);
                    }}
                    style={{
                      background: 'var(--os-card)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: isHighlighted
                        ? '0 0 0 3px rgba(46,158,91,.5), 0 12px 28px -12px rgba(46,158,91,.5)'
                        : isMilestone
                          ? '0 12px 28px -12px rgba(232,177,76,.55)'
                          : isRecognized
                            ? '0 10px 26px -14px rgba(233,160,59,.45)'
                            : '0 8px 22px -16px rgba(0,0,0,.2)',
                      border: isHighlighted
                        ? '1.5px solid rgba(46,158,91,.7)'
                        : isMilestone
                          ? '1.5px solid rgba(232,177,76,.6)'
                          : isRecognized
                            ? '1.5px solid rgba(233,160,59,.4)'
                            : 'none',
                      transition: 'box-shadow .4s ease, border-color .4s ease',
                    }}
                  >
                    <div style={{ aspectRatio: '1', background: '#100E0C', position: 'relative' }}>
                      {m.cardDefinition ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CardFace data={m.cardDefinition} side="front" size={100} photoUrl={m.cardPhotoUrl} />
                        </div>
                      ) : previewMedia ? (
                        <div
                          ref={(el) => { mediaTriggerRefs.current[m.id] = el; }}
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${previewMedia.kind === 'video' ? 'video' : 'photo'} for ${m.title}`}
                          onClick={() => setExpandedMomentId(m.id)}
                          onKeyDown={onActivateKey(() => setExpandedMomentId(m.id))}
                          style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
                        >
                          <MomentThumbnail mediaUrl={previewMedia.url} mediaKind={previewMedia.kind} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,.45) 0%, transparent 40%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 5px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8.5, fontWeight: 800, letterSpacing: '.03em', color: '#fff', textTransform: 'uppercase' }}>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /></svg>
                              View
                            </span>
                          </div>
                          {previewMedia.kind === 'video' && (
                            <div style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                            </div>
                          )}
                        </div>
                      ) : null}
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
                        {[playerProfile.footballAgeGroup, m.seasonLabel ?? 'Earlier', m.occurredOn ? formatMomentDate(m.occurredOn) : null].filter(Boolean).join(' • ')}
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

                      {/* Public visibility — deliberately a separate row,
                          separate copy, and separate colour from the
                          verification badge above: coach-verified and
                          public are unrelated facts about a moment, and
                          this control must never imply otherwise. */}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--os-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: m.visibility === 'public' ? '#2E9E5B' : 'var(--os-muted)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.visibility === 'public' ? '#2E9E5B' : 'var(--os-muted)' }} />
                            {m.visibility === 'public' ? 'Public' : 'Private'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMomentVisibility(m.id, m.visibility === 'public' ? 'private' : 'public')}
                            disabled={visibilityBusyId === m.id}
                            style={{
                              background: 'none', border: 'none', padding: 0,
                              fontFamily: 'Roboto', fontWeight: 700, fontSize: 11,
                              color: visibilityBusyId === m.id ? 'var(--os-muted)' : m.visibility === 'public' ? 'var(--os-muted)' : '#E97435',
                              textDecoration: 'underline', cursor: visibilityBusyId === m.id ? 'default' : 'pointer',
                            }}
                          >
                            {visibilityBusyId === m.id ? 'Updating…' : m.visibility === 'public' ? 'Make private' : 'Make public'}
                          </button>
                        </div>
                        {m.visibility === 'public' && m.status === 'pending_verification' && (
                          <p style={{ fontSize: 9.5, lineHeight: 1.35, color: 'var(--os-muted)', margin: '4px 0 0' }}>
                            This will appear publicly after your coach verifies it.
                          </p>
                        )}
                        {m.visibility === 'private' && (
                          <p style={{ fontSize: 9.5, lineHeight: 1.35, color: 'var(--os-muted)', margin: '4px 0 0' }}>
                            Public moments can be seen by anyone who taps the card.
                            {m.status === 'pending_verification' ? ' This one will appear publicly only after your coach verifies it.' : ''}
                          </p>
                        )}
                        {visibilityErrorId === m.id && (
                          <p role="alert" style={{ fontSize: 10, color: '#C0392B', margin: '4px 0 0' }}>
                            Couldn&apos;t update — try again.
                          </p>
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

      {expandedMoment && (
        <MomentMediaViewer
          mode="view"
          item={toMomentMediaItem(expandedMoment, playerProfile.name)}
          onClose={() => closeMediaViewer(expandedMoment.id)}
        />
      )}
    </>
  );
}
