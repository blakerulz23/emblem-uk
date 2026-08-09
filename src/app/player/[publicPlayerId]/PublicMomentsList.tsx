'use client';

import { useRef, useState } from 'react';
import { onActivateKey } from '@/app/os/a11y';
import MomentMediaViewer, { type MomentMediaItem } from '@/app/os/overlays/MomentMediaViewer';
import { MomentThumbnail } from '@/app/os/overlays/MomentThumbnail';
import type { PublicMoment } from '@/lib/public-player-profile';

const COLORS = {
  card: '#ffffff',
  ink: '#15130F',
  muted: '#8A8378',
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Public-facing wording for verification_status — deliberately its own
 * copy, not a reuse of MOMENT_STATUS_BADGE's OS labels ("Coach Verified",
 * "Family Memory", "Recorded by Emblem" — see src/app/os/data.tsx):
 * sentence case reads softer for a page strangers may land on, and
 * "family memory" must never be phrased in a way a stranger could read as
 * coach-approved.
 */
const PUBLIC_STATUS_LABEL: Record<PublicMoment['status'], string> = {
  coach_verified: 'Coach verified',
  family_memory: 'Family memory',
  system_generated: 'Recorded by Emblem',
};

/**
 * Client island for the public profile's Timeline — the page itself
 * (page.tsx) is a Server Component and stays that way; only the
 * interactive "open a moment's cover media full-screen" behaviour needs to
 * run client-side (state, Escape key, focus management). Receives exactly
 * the same `profile.moments`/`profile.name` the server page already
 * resolved and would otherwise render inline — no new data crosses the
 * server/client boundary that wasn't already going to be in the page's own
 * rendered HTML; this component only makes the cover image/video of each
 * already-public moment clickable.
 *
 * mode="view" always — no approve/reject/edit/download/share affordance of
 * any kind, matching the public page's existing read-only nature exactly.
 */
function toPublicMomentMediaItem(m: PublicMoment, playerName: string): MomentMediaItem {
  const cover = m.media[0] ?? null;
  return {
    mediaUrl: cover?.url ?? '',
    mediaKind: cover ? (cover.kind === 'video' ? 'video' : 'image') : null,
    title: m.title,
    playerName,
    date: formatDate(m.occurredOn) ?? '',
    note: m.note,
    status: PUBLIC_STATUS_LABEL[m.status],
  };
}

export default function PublicMomentsList({ moments, playerName }: { moments: PublicMoment[]; playerName: string }) {
  // Index into `moments`, not a database id — this DTO carries none (see
  // PublicMoment's doc comment in public-player-profile.ts). The list is
  // server-rendered once per request and never reordered/spliced client-side,
  // so an index is a stable, non-sensitive key for both React and focus state.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const triggerRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const closeViewer = (index: number) => {
    setExpandedIndex((current) => (current === index ? null : current));
    triggerRefs.current[index]?.focus();
  };
  const expandedMoment = expandedIndex !== null ? moments[expandedIndex] ?? null : null;

  return (
    <>
      <div style={{ display: 'grid', gap: 12 }}>
        {moments.map((m, index) => {
          const cover = m.media[0];
          const hasViewableCover = cover && (cover.kind === 'photo' || cover.kind === 'video');
          return (
            <div key={index} style={{ background: COLORS.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 6px 18px -14px rgba(0,0,0,.2)' }}>
              {hasViewableCover && (
                <div
                  ref={(el) => { triggerRefs.current[index] = el; }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View ${cover.kind === 'video' ? 'video' : 'photo'} for ${m.title}`}
                  onClick={() => setExpandedIndex(index)}
                  onKeyDown={onActivateKey(() => setExpandedIndex(index))}
                  style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', cursor: 'pointer' }}
                >
                  <MomentThumbnail mediaUrl={cover.url} mediaKind={cover.kind === 'video' ? 'video' : 'photo'} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(0,0,0,.4) 0%, transparent 35%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '0 10px 10px 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', color: '#fff', textTransform: 'uppercase', background: 'rgba(0,0,0,.4)', padding: '4px 8px', borderRadius: 999 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" /></svg>
                      View
                    </span>
                  </div>
                  {cover.kind === 'video' && (
                    <div style={{ position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  )}
                </div>
              )}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: 15, color: COLORS.ink }}>{m.title}</div>
                <div style={{ fontFamily: 'Roboto', fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>
                  {[formatDate(m.occurredOn), PUBLIC_STATUS_LABEL[m.status]].filter(Boolean).join(' · ')}
                </div>
                {m.note && <p style={{ fontFamily: 'Roboto', fontSize: 13, color: COLORS.ink, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>{m.note}</p>}
                {/* Additional media beyond the cover stay static, exactly as before — one media item per moment is viewable full-screen in this MVP, matching Coach Verify's own scope. */}
                {m.media.slice(1).map((media, mediaIndex) =>
                  media.kind === 'photo' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={mediaIndex} src={media.url} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 10 }} />
                  ) : (
                    <video key={mediaIndex} src={media.url} controls style={{ width: '100%', borderRadius: 10, marginTop: 10 }} />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      {expandedMoment && expandedIndex !== null && (
        <MomentMediaViewer
          mode="view"
          item={toPublicMomentMediaItem(expandedMoment, playerName)}
          onClose={() => closeViewer(expandedIndex)}
        />
      )}
    </>
  );
}
