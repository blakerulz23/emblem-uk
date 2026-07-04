'use client';

// MagnetArt — photorealistic refrigerator magnet render.
// Thick gloss face + visible depth edge + multi-layer shadow.

import CardArt from './CardArt';
import type { CardTemplate, CharmShape, Details } from './data';

const DEPTH = 0.045; // edge thickness as fraction of size

export default function MagnetArt({
  template,
  photo,
  details,
  shape = 'rectangular',
  size = 200,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  shape?: CharmShape;
  size?: number;
}) {
  const depth = Math.max(4, Math.round(size * DEPTH));

  // ── Circular magnet ───────────────────────────────────────────────────────
  if (shape === 'circular') {
    const cardW = Math.round(size * 0.70);
    return (
      <div
        style={{
          position:  'relative',
          width:     size,
          height:    size,
          flexShrink: 0,
        }}
      >
        {/* Bottom depth layer — gives 3-D thickness illusion */}
        <div
          aria-hidden
          style={{
            position:     'absolute',
            top:          depth,
            left:         depth * 0.5,
            width:        size,
            height:       size,
            borderRadius: '50%',
            background:   'linear-gradient(135deg, #888 0%, #444 100%)',
          }}
        />
        {/* Main gloss face */}
        <div
          style={{
            position:     'absolute',
            top:          0,
            left:         0,
            width:        size,
            height:       size,
            borderRadius: '50%',
            overflow:     'hidden',
            background:   '#fff',
            boxShadow: `
              0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.10)}px rgba(0,0,0,0.35),
              0 ${Math.round(size * 0.01)}px ${Math.round(size * 0.03)}px rgba(0,0,0,0.22)
            `,
          }}
        >
          {/* Card centred */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
            <CardArt template={template} photo={photo} details={details} size={cardW} />
          </div>
          {/* High-gloss UV coat */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
            background: 'linear-gradient(140deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.10) 32%, transparent 55%)',
          }}/>
          {/* Rim highlight */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(255,255,255,0.30)',
          }}/>
        </div>
      </div>
    );
  }

  // ── Rectangular magnet ────────────────────────────────────────────────────
  const w  = size;
  const h  = Math.round(w * 1.415);
  const br = Math.max(6, Math.round(w * 0.055));

  return (
    <div
      style={{
        position:  'relative',
        width:     w,
        height:    h,
        flexShrink: 0,
      }}
    >
      {/* Right depth face */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          top:          depth * 0.5,
          left:         depth,
          width:        w,
          height:       h,
          borderRadius: br,
          background:   'linear-gradient(180deg, #7a7a86 0%, #3a3a44 100%)',
        }}
      />
      {/* Bottom depth face */}
      <div
        aria-hidden
        style={{
          position:     'absolute',
          top:          depth,
          left:         depth * 0.4,
          width:        w,
          height:       h,
          borderRadius: br,
          background:   'linear-gradient(90deg, #5a5a66 0%, #3a3a44 100%)',
          opacity:      0.7,
        }}
      />
      {/* Main gloss face */}
      <div
        style={{
          position:     'absolute',
          top:          0,
          left:         0,
          width:        w,
          height:       h,
          borderRadius: br,
          overflow:     'hidden',
          boxShadow: `
            0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.12)}px rgba(0,0,0,0.38),
            0 ${Math.round(size * 0.01)}px ${Math.round(size * 0.04)}px rgba(0,0,0,0.24),
            inset 0 1px 0 rgba(255,255,255,0.85)
          `,
        }}
      >
        <CardArt template={template} photo={photo} details={details} size={w} />
        {/* UV gloss coat — strong specular top-left */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: br, pointerEvents: 'none',
          background: 'linear-gradient(140deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.08) 30%, transparent 52%)',
        }}/>
        {/* Edge bevel highlights */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: br, pointerEvents: 'none',
          boxShadow: `
            inset 0  1px 0 rgba(255,255,255,0.82),
            inset 0 -1px 0 rgba(255,255,255,0.25),
            inset  1px 0 0 rgba(255,255,255,0.55),
            inset -1px 0 0 rgba(255,255,255,0.18)
          `,
        }}/>
      </div>
    </div>
  );
}
