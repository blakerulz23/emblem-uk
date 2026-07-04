'use client';

import type { CSSProperties } from 'react';
import type { CharmShape, Details, PhotoCharm } from './data';

// Renders a flat photo charm (used for Pins and Magnets).
// kind 'pin'    — small enamel-style with metallic rim + small back-pin nub.
// kind 'magnet' — flatter, photo full-bleed, soft drop shadow.
export default function PhotoCharmPreview({
  charm,
  photo,
  details,
  kind,
  size = 200,
}: {
  charm: PhotoCharm;
  photo: string | null;
  details?: Details | null;
  kind: 'pin' | 'magnet';
  size?: number;
}) {
  const shape: CharmShape = charm.shape;
  const isCircle = shape === 'circular';
  const w = size;
  const h = isCircle ? size : Math.round(size * 1.25);

  const containerStyle: CSSProperties = {
    width: w,
    height: h,
    position: 'relative',
    borderRadius: isCircle ? w / 2 : Math.round(w * 0.07),
    overflow: 'visible',
  };

  const rim = kind === 'pin' ? 4 : 2;
  const rimColor =
    kind === 'pin'
      ? 'linear-gradient(135deg, #f3f3f5 0%, #c0c0c5 50%, #8c8d92 100%)' // brushed silver
      : '#1e1f23'; // thin dark edge for magnet

  return (
    <div style={containerStyle}>
      {/* outer rim / backing */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: isCircle ? w / 2 : Math.round(w * 0.07),
          background: kind === 'pin' ? (rimColor as string) : '#0b0b0f',
          boxShadow:
            kind === 'pin'
              ? '0 12px 28px rgba(11,11,15,.32), inset 0 1px 0 rgba(255,255,255,.5)'
              : '0 14px 26px rgba(11,11,15,.28)',
        }}
      />

      {/* inner photo well */}
      <div
        style={{
          position: 'absolute',
          inset: rim,
          borderRadius: isCircle ? (w / 2 - rim) : Math.round(w * 0.07) - 2,
          overflow: 'hidden',
          background: '#0b0b0f',
          boxShadow: kind === 'magnet' ? 'inset 0 0 0 1px rgba(255,255,255,.04)' : 'inset 0 0 0 1px rgba(0,0,0,.18)',
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 22%',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'rgba(255,255,255,.4)',
              fontFamily: 'var(--font-jbmono), monospace',
              fontSize: 10,
              letterSpacing: '0.12em',
            }}
          >
            ATHLETE PHOTO
          </div>
        )}

        {/* gloss arc */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.1) 100%)',
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />

        {/* nameplate (only when there's a name) */}
        {details?.name && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: `${Math.max(4, w * 0.04)}px ${w * 0.06}px ${Math.max(6, w * 0.05)}px`,
              background:
                'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 35%, rgba(0,0,0,.85) 100%)',
              color: '#fff',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-sora), system-ui',
                fontWeight: 800,
                fontSize: Math.max(11, w * 0.075),
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                lineHeight: 1.05,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {details.name}
              {details.number ? <span style={{ marginLeft: 6, color: 'var(--accent)' }}>#{details.number}</span> : null}
            </div>
          </div>
        )}
      </div>

      {/* Pin: tiny back-pin nub poking out of the top */}
      {kind === 'pin' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 6,
            height: 12,
            borderRadius: 2,
            background: 'linear-gradient(180deg, #f3f3f5, #9a9b9f)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* Magnet: subtle "shadow on fridge" hint */}
      {kind === 'magnet' && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '8%',
            right: '8%',
            bottom: -10,
            height: 12,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(0,0,0,.22) 0%, transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      )}
    </div>
  );
}
