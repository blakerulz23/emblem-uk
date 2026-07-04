'use client';

// KeychainArt — photorealistic acrylic keychain render.
// Bevelled acrylic slab + 3D chrome split-ring + edge refraction.

import CardArt from './CardArt';
import type { CardTemplate, Details, KeychainShape } from './data';

// 3D chrome split-ring rendered in SVG
function SplitRing({ size }: { size: number }) {
  const r  = size / 2;
  const sw = Math.max(2, size * 0.18); // stroke weight
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 40 40"
      style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}
    >
      <defs>
        <linearGradient id="ring-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="30%"  stopColor="#d0d0d8" />
          <stop offset="60%"  stopColor="#8a8a96" />
          <stop offset="100%" stopColor="#c8c8d2" />
        </linearGradient>
        <linearGradient id="ring-chrome2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#e8e8f0" />
          <stop offset="100%" stopColor="#606068" />
        </linearGradient>
      </defs>
      {/* Outer ring */}
      <circle cx="20" cy="20" r="16" fill="none" stroke="url(#ring-chrome)"  strokeWidth="5.5" />
      {/* Inner highlight */}
      <circle cx="20" cy="20" r="16" fill="none" stroke="url(#ring-chrome2)" strokeWidth="2"
        strokeDasharray="28 72" strokeDashoffset="14" />
      {/* Split gap */}
      <line x1="20" y1="3.5" x2="20" y2="11"
        stroke="#1a1a22" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

// Acrylic bevel edge — drawn as thin gradient border
function AcrylicEdge({ borderRadius }: { borderRadius: number }) {
  return (
    <div
      aria-hidden
      style={{
        position:     'absolute',
        inset:        0,
        borderRadius,
        // Simulates the chamfered edge catching light
        boxShadow: `
          inset 0  1px 0 rgba(255,255,255,0.85),
          inset 0 -1px 0 rgba(255,255,255,0.35),
          inset  1px 0 0 rgba(255,255,255,0.55),
          inset -1px 0 0 rgba(255,255,255,0.25)
        `,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function KeychainArt({
  template,
  photo,
  details,
  shape = 'circular',
  size = 200,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details;
  shape?: KeychainShape;
  size?: number;
}) {
  const ringSize = Math.max(18, Math.round(size * 0.13));

  // ── Circular ──────────────────────────────────────────────────────────────
  if (shape === 'circular') {
    const cardW = Math.round(size * 0.68);
    return (
      <div style={{ position: 'relative', width: size, height: size + ringSize * 0.6, flexShrink: 0 }}>
        {/* Split ring */}
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <SplitRing size={ringSize} />
        </div>
        {/* Acrylic disc */}
        <div
          style={{
            position:     'absolute',
            top:          ringSize * 0.6,
            left:         0,
            width:        size,
            height:       size,
            borderRadius: '50%',
            overflow:     'hidden',
            // Acrylic body: slightly warm clear
            background:   'rgba(255,255,255,0.92)',
            boxShadow: `
              0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.10)}px rgba(0,0,0,0.30),
              0 ${Math.round(size * 0.01)}px ${Math.round(size * 0.03)}px rgba(0,0,0,0.20),
              inset 0 1px 2px rgba(255,255,255,0.9)
            `,
          }}
        >
          {/* Card centred inside */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
            <CardArt template={template} photo={photo} details={details} size={cardW} />
          </div>
          {/* Gloss sheen */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0.08) 38%, transparent 58%)',
            pointerEvents: 'none',
          }}/>
          <AcrylicEdge borderRadius={size / 2} />
        </div>
      </div>
    );
  }

  // ── Slab ──────────────────────────────────────────────────────────────────
  if (shape === 'slab') {
    const w       = Math.round(size * 0.80);
    const pad     = Math.round(w * 0.07);
    const labelH  = Math.round(w * 0.13);
    const cardW   = w - pad * 2;
    const cardH   = Math.round(cardW * 1.415);
    const h       = labelH + cardH + pad * 2;
    const br      = 12;

    return (
      <div style={{ position: 'relative', width: w, height: h + ringSize * 0.6, flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <SplitRing size={ringSize} />
        </div>
        {/* Acrylic slab body */}
        <div
          style={{
            position:   'absolute',
            top:        ringSize * 0.6,
            left:       0,
            width:      w,
            height:     h,
            borderRadius: br,
            overflow:   'hidden',
            background: 'rgba(248,248,252,0.96)',
            boxShadow: `
              0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.12)}px rgba(0,0,0,0.32),
              0 ${Math.round(size * 0.01)}px ${Math.round(size * 0.03)}px rgba(0,0,0,0.18),
              inset 0 1px 0 rgba(255,255,255,0.95)
            `,
          }}
        >
          {/* Chrome header bar */}
          <div style={{
            height:     labelH,
            background: 'linear-gradient(180deg, #e8e8f0 0%, #ccccd8 100%)',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(0,0,0,0.12)',
            boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.8)',
          }}>
            <span style={{
              fontFamily:    'var(--font-jbmono), monospace',
              fontSize:      Math.max(7, Math.round(labelH * 0.38)),
              fontWeight:    700,
              letterSpacing: '0.14em',
              color:         '#2a2a38',
              textShadow:    '0 1px 0 rgba(255,255,255,0.7)',
            }}>
              EMBLEM
            </span>
          </div>
          {/* Card inset */}
          <div style={{ padding: pad, display: 'grid', placeItems: 'center' }}>
            <div style={{ borderRadius: 5, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)' }}>
              <CardArt template={template} photo={photo} details={details} size={cardW} />
            </div>
          </div>
          {/* Gloss */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.06) 35%, transparent 55%)',
            borderRadius: br, pointerEvents: 'none',
          }}/>
          <AcrylicEdge borderRadius={br} />
        </div>
      </div>
    );
  }

  // ── Rectangular ───────────────────────────────────────────────────────────
  const w  = Math.round(size * 0.80);
  const h  = Math.round(w * 1.415);
  const br = 14;

  return (
    <div style={{ position: 'relative', width: w, height: h + ringSize * 0.6, flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <SplitRing size={ringSize} />
      </div>
      {/* Acrylic rectangle */}
      <div
        style={{
          position:     'absolute',
          top:          ringSize * 0.6,
          left:         0,
          width:        w,
          height:       h,
          borderRadius: br,
          overflow:     'hidden',
          background:   'rgba(248,248,252,0.95)',
          boxShadow: `
            0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.12)}px rgba(0,0,0,0.30),
            0 ${Math.round(size * 0.01)}px ${Math.round(size * 0.03)}px rgba(0,0,0,0.18),
            inset 0 1px 0 rgba(255,255,255,0.95)
          `,
        }}
      >
        <CardArt template={template} photo={photo} details={details} size={w} />
        {/* Gloss */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(145deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.06) 38%, transparent 58%)',
          borderRadius: br, pointerEvents: 'none',
        }}/>
        <AcrylicEdge borderRadius={br} />
      </div>
    </div>
  );
}
