'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The one place a moment's *collapsed-card* media preview is rendered —
 * shared by PlayerHome, RealCollection, and the public profile's
 * PublicMomentsList, all three of which previously did `<img src={url}>`
 * unconditionally, including for video-kind media (a broken-image icon in
 * a real browser, since a raw video URL is not decodable as an image).
 *
 * moment_media has no poster/thumbnail column at all (confirmed against
 * 0001_init.sql — `id, moment_id, s3_key, kind, created_at`, nothing else)
 * — there is no real poster URL to prefer. A muted, controls-less
 * `preload="metadata"` <video> is the safe, no-new-storage substitute: it
 * asks the browser to fetch just enough to paint the first frame, never
 * plays, and degrades to a plain icon placeholder if even that fails
 * (slow network, unsupported codec, or — in local/staging test
 * environments without real S3 objects — a genuinely missing file).
 * Full native controls remain exclusive to MomentMediaViewer's expanded
 * view; this component is never interactive on its own (pointer-events
 * disabled) — the *card's own* trigger wrapper is what's clickable.
 */
export type MomentThumbnailKind = 'photo' | 'video';

export function MomentThumbnail({
  mediaUrl,
  mediaKind,
  alt = '',
}: {
  mediaUrl: string;
  mediaKind: MomentThumbnailKind;
  alt?: string;
}) {
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // These cards are server-rendered (the public profile page, in
  // particular), so the <video src> is already in the HTML the browser
  // parses before React hydrates. A load failure can fire the native
  // 'error' event in that gap, before the onError prop's listener is
  // attached, which would silently strand the card with no fallback ever
  // showing. Checking videoRef.current.error on mount catches that case;
  // the native addEventListener below still catches later failures.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.error) {
      setVideoUnavailable(true);
      return;
    }
    const handleError = () => setVideoUnavailable(true);
    v.addEventListener('error', handleError);
    return () => v.removeEventListener('error', handleError);
  }, [mediaUrl]);

  if (mediaKind === 'video') {
    if (videoUnavailable) {
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141210' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B6357" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9.5l4-2.2v9.4l-4-2.2" />
          </svg>
        </div>
      );
    }
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        ref={videoRef}
        src={mediaUrl}
        preload="metadata"
        muted
        playsInline
        aria-hidden="true"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={mediaUrl} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
}
