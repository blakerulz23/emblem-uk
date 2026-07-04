'use client';

// PosterArt — photorealistic fine-art print render.
// Warm paper mat border + card face + multi-layer shadow + subtle gloss sheen.

import CardArt from './CardArt';
import type { CardTemplate, Details } from './data';

export default function PosterArt({
  template,
  photo,
  details,
  size = 220,
  selected,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  size?: number;
  selected?: boolean;
}) {
  const mat    = Math.round(size * 0.095);   // white mat/mount border
  const cardW  = size - mat * 2;
  const cardH  = Math.round(cardW * 1.415);
  const totalH = cardH + mat * 2;

  return (
    <div
      style={{
        position:     'relative',
        width:        size,
        height:       totalH,
        borderRadius: 4,
        // Warm matte paper — slightly cream/warm white
        background:   '#f6f4ef',
        // Realistic paper print shadow: close sharp + wide diffuse
        boxShadow: selected
          ? `0 0 0 2px ${template.accent},
             0 2px 6px  rgba(0,0,0,0.18),
             0 8px 22px rgba(0,0,0,0.20),
             0 22px 44px rgba(0,0,0,0.12)`
          : `0 2px 6px  rgba(0,0,0,0.16),
             0 8px 22px rgba(0,0,0,0.18),
             0 22px 44px rgba(0,0,0,0.10)`,
        // Thin outer frame line
        outline:      '1px solid rgba(0,0,0,0.09)',
        overflow:     'hidden',
        flexShrink:   0,
      }}
    >
      {/* Paper grain texture overlay */}
      <div
        aria-hidden
        style={{
          position:   'absolute',
          inset:      0,
          background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.038'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
          zIndex:     2,
        }}
      />
      {/* Mat inner shadow (inset depth) */}
      <div
        aria-hidden
        style={{
          position:   'absolute',
          inset:      0,
          boxShadow:  'inset 0 0 18px rgba(0,0,0,0.07)',
          pointerEvents: 'none',
          zIndex:     3,
        }}
      />
      {/* Mat border score line — thin inset rule */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          inset:        Math.round(mat * 0.55),
          border:       '1px solid rgba(0,0,0,0.08)',
          borderRadius: 2,
          pointerEvents: 'none',
          zIndex:       3,
        }}
      />
      {/* Card face */}
      <div
        style={{
          position: 'absolute',
          top:      mat,
          left:     mat,
          // Subtle inner shadow below mat edge
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <CardArt template={template} photo={photo} details={details} size={cardW} />
      </div>
      {/* Gloss sheen: top-left specular */}
      <div
        aria-hidden
        style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 40%, transparent 65%)',
          pointerEvents: 'none',
          zIndex:     4,
        }}
      />
    </div>
  );
}
