'use client';

// StickerArt — photorealistic glossy die-cut sticker render.
// White border + high-gloss specular overlay + multi-layer shadow.

import CardArt from './CardArt';
import type { CardTemplate, Details } from './data';

export default function StickerArt({
  template,
  photo,
  details,
  size = 200,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  size?: number;
}) {
  const border = Math.max(5, Math.round(size * 0.055));  // white die-cut border
  const cardW  = Math.round((size - border * 2) * 0.74); // card fits inside circle
  const radius = size / 2;

  return (
    <div
      style={{
        position:     'relative',
        width:        size,
        height:       size,
        borderRadius: '50%',
        flexShrink:   0,
      }}
    >
      {/* Outer peel shadow — diffuse, offset downward */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          inset:        0,
          borderRadius: '50%',
          boxShadow: `
            0 ${Math.round(size * 0.05)}px ${Math.round(size * 0.12)}px rgba(0,0,0,0.28),
            0 ${Math.round(size * 0.02)}px ${Math.round(size * 0.04)}px rgba(0,0,0,0.18)
          `,
        }}
      />

      {/* White vinyl backing */}
      <div
        style={{
          position:     'absolute',
          inset:        0,
          borderRadius: '50%',
          background:   '#ffffff',
          overflow:     'hidden',
        }}
      >
        {/* Card face — centred */}
        <div
          style={{
            position:  'absolute',
            top:       '50%',
            left:      '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: Math.round(cardW * 0.05),
            overflow:  'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}
        >
          <CardArt template={template} photo={photo} details={details} size={cardW} />
        </div>

        {/* Gloss coat layer 1 — full-surface shine */}
        <div
          aria-hidden
          style={{
            position:   'absolute',
            inset:      0,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 35%, transparent 60%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
        {/* Gloss coat layer 2 — bottom-right counter-shine */}
        <div
          aria-hidden
          style={{
            position:   'absolute',
            inset:      0,
            background: 'radial-gradient(ellipse at 72% 76%, rgba(255,255,255,0.18) 0%, transparent 55%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* White border ring — kiss-cut edge */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          inset:        0,
          borderRadius: '50%',
          boxShadow:    `inset 0 0 0 ${border}px #ffffff, inset 0 0 0 ${border + 1}px rgba(0,0,0,0.06)`,
          pointerEvents: 'none',
        }}
      />

      {/* High specular highlight — top-left bright spot */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          top:          '8%',
          left:         '12%',
          width:        '40%',
          height:       '22%',
          borderRadius: '50%',
          background:   'radial-gradient(ellipse, rgba(255,255,255,0.72) 0%, transparent 70%)',
          filter:       'blur(4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Subtle curl shadow — bottom-right corner to simulate peel */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          bottom:       '-4%',
          right:        '-2%',
          width:        '32%',
          height:       '32%',
          background:   'radial-gradient(ellipse at 70% 70%, rgba(0,0,0,0.18) 0%, transparent 65%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
