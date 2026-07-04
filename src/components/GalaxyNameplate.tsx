'use client';

import { useId } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// GalaxyNameplate
//
// Three-layer SVG text stack so strokes never bleed into each other:
//   Layer 1 — white/silver stroke only  (widest — forms the bright outer rim)
//   Layer 2 — black stroke only         (sits inside the white)
//   Layer 3 — holographic gradient fill (covers the glyph interior)
//
// Props
//   playerName       — athlete name (auto-uppercased, italic condensed)
//   teamName         — team name
//   position         — position abbreviation e.g. "GUARD"
//   fontScale        — overall size multiplier (default 1.0)
//   chromeIntensity  — 0 = flat, 1 = full holo intensity (default 1.0)
//   className        — optional wrapper className
// ─────────────────────────────────────────────────────────────────────────────

export interface GalaxyNameplateProps {
  playerName: string;
  teamName: string;
  position: string;
  fontScale?: number;
  chromeIntensity?: number;
  className?: string;
}

const FONT_STACK = `var(--font-oswald), 'Oswald', 'Barlow Condensed', 'Arial Black', 'Impact', sans-serif`;
const CANVAS_W   = 1000;

export default function GalaxyNameplate({
  playerName,
  teamName,
  position,
  fontScale       = 1,
  chromeIntensity = 1,
  className       = '',
}: GalaxyNameplateProps) {
  const rawId = useId();
  const uid   = `gnp${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  const ci = Math.max(0, Math.min(1, chromeIntensity));

  // ── Layout ────────────────────────────────────────────────────────────────
  const nameSize = Math.round(130 * fontScale);
  const subSize  = Math.round(22  * fontScale);
  const nameY    = nameSize * 0.92;                             // text baseline
  const scrimPad = Math.round(16  * fontScale);
  const divY     = nameSize       + Math.round(14 * fontScale); // divider y
  const subY     = divY           + Math.round(22 * fontScale) + subSize * 0.85;
  const totalH   = subY           + Math.round(20 * fontScale);

  // ── Stroke widths (proportional to nameSize) ──────────────────────────────
  // Layer 1 white: half of this extends outside the glyph → visible white rim.
  // Layer 2 black: half of this extends outside the glyph → covers inner white.
  // Net silver rim = (whiteStrokeW - blackStrokeW) / 2
  // Net black band = blackStrokeW / 2   (outer half; fill covers inner half)
  const whiteStrokeW = nameSize * 0.21;  // ~27 units at default size
  const blackStrokeW = nameSize * 0.13;  // ~17 units at default size
  // Result: ~7 units silver rim, then ~8.5 units visible black → clear outline

  const nameStr = playerName.toUpperCase();
  const subText = `${teamName.toUpperCase()} • ${position.toUpperCase()}`;

  // Shared text props repeated across all 3 name layers.
  const nameProps = {
    x:          CANVAS_W / 2,
    y:          nameY,
    textAnchor: 'middle' as const,
    fontFamily: FONT_STACK,
    fontWeight: '700' as const,
    fontStyle:  'italic' as const,   // italic — matches reference
    fontSize:   nameSize,
    strokeLinejoin: 'round' as const,
  };

  return (
    <div
      className={`relative select-none ${className}`}
    >
      {/* ── Soft glow halo behind everything ── */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          background:    `radial-gradient(ellipse 85% 55% at 50% 38%, rgba(180,100,255,${0.18 * ci}) 0%, rgba(0,210,255,${0.08 * ci}) 60%, transparent 85%)`,
          filter:        `blur(${Math.round(22 * fontScale)}px)`,
          transform:     'scaleY(0.5)',
          pointerEvents: 'none',
          top:           `${-12 * fontScale}px`,
        }}
      />

      <svg
        viewBox={`0 0 ${CANVAS_W} ${totalH}`}
        width="100%"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${nameStr} — ${subText}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <defs>
          {/* ── Holographic fill: purple → pink → cyan (galaxy holo palette) ── */}
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#C77DFF" />
            <stop offset="45%"  stopColor="#F38BB8" stopOpacity={ci < 1 ? 0.7 + ci * 0.3 : 1} />
            <stop offset="100%" stopColor="#B7F3E8" />
          </linearGradient>

          {/* ── Metallic rule gradient ── */}
          <linearGradient id={`${uid}-rule`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
            <stop offset="20%"  stopColor={`rgba(210,210,210,${0.50 * ci})`} />
            <stop offset="50%"  stopColor={`rgba(255,255,255,${0.72 * ci})`} />
            <stop offset="80%"  stopColor={`rgba(210,210,210,${0.50 * ci})`} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* ── Drop shadow filter applied to the fill layer ── */}
          <filter id={`${uid}-shadow`} x="-8%" y="-10%" width="116%" height="130%"
                  colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy={Math.round(4 * fontScale)}
                          stdDeviation={Math.round(5 * fontScale)}
                          floodColor="rgba(0,0,0,0.80)" />
            {/* second, wider shadow for extra depth */}
            <feDropShadow dx="0" dy={Math.round(2 * fontScale)}
                          stdDeviation={Math.round(12 * fontScale)}
                          floodColor="rgba(0,0,0,0.45)" />
          </filter>

          {/* ── Clip path — for shimmer highlight rect ── */}
          <clipPath id={`${uid}-clip`}>
            <text {...nameProps}>{nameStr}</text>
          </clipPath>

          {/* ── Shimmer highlight gradient (top 22% of glyph) ── */}
          <linearGradient id={`${uid}-shim`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.55)" />
            <stop offset="22%"  stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* ════════════════════════════════════════════════
            DARK SCRIM — sits behind name, boosts contrast
            ════════════════════════════════════════════════ */}
        <rect
          x={CANVAS_W * 0.04}
          y={-scrimPad}
          width={CANVAS_W * 0.92}
          height={nameSize + scrimPad * 2}
          rx={Math.round(8 * fontScale)}
          fill={`rgba(0,0,0,${0.22 * ci})`}
        />

        {/* ════════════════════════════════════════════════
            PLAYER NAME — 3-layer paint stack
            ════════════════════════════════════════════════ */}

        {/*
          Layer 1 — WHITE / SILVER outer stroke
          Stroke is centered on the glyph edge.
          Since fill="none", the full strokeWidth is visible as a band.
          The outer (whiteStrokeW - blackStrokeW)/2 of this will show as silver.
        */}
        <text
          {...nameProps}
          fill="none"
          stroke={`rgba(235,235,240,${0.82 + ci * 0.18})`}
          strokeWidth={whiteStrokeW}
        >
          {nameStr}
        </text>

        {/*
          Layer 2 — BLACK stroke
          Sits on top of the white, narrower → only the silver rim shows.
          The outer blackStrokeW/2 visible outside the fill = the black band.
        */}
        <text
          {...nameProps}
          fill="none"
          stroke={`rgba(4,4,4,0.97)`}
          strokeWidth={blackStrokeW}
        >
          {nameStr}
        </text>

        {/*
          Layer 3 — HOLOGRAPHIC GRADIENT FILL + drop shadow
          Covers the glyph interior with the purple→pink→cyan gradient.
          Drop shadow gives the strong dark halo behind the letters.
        */}
        <text
          {...nameProps}
          fill={`url(#${uid}-fill)`}
          filter={`url(#${uid}-shadow)`}
        >
          {nameStr}
        </text>

        {/*
          Layer 4 — SHIMMER highlight
          White gradient rect clipped to letterforms; covers upper 22%.
        */}
        <rect
          x={0} y={0}
          width={CANVAS_W}
          height={nameSize * 0.92}
          fill={`url(#${uid}-shim)`}
          clipPath={`url(#${uid}-clip)`}
          opacity={0.6 * ci}
        />

        {/* ════════════════════════════════════════════════
            METALLIC DIVIDER RULE
            ════════════════════════════════════════════════ */}
        <line
          x1={CANVAS_W * 0.14} y1={divY}
          x2={CANVAS_W * 0.86} y2={divY}
          stroke={`url(#${uid}-rule)`}
          strokeWidth={Math.max(0.8, 1.4 * fontScale)}
        />

        {/* ════════════════════════════════════════════════
            TEAM · POSITION
            ════════════════════════════════════════════════ */}

        {/* black shadow pass */}
        <text
          x={CANVAS_W / 2}
          y={subY + Math.round(2.5 * fontScale)}
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontWeight="600"
          fontSize={subSize}
          letterSpacing={Math.max(3, 4 * fontScale)}
          fill="rgba(0,0,0,0.65)"
        >
          {subText}
        </text>

        {/* main white pass */}
        <text
          x={CANVAS_W / 2}
          y={subY}
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontWeight="600"
          fontSize={subSize}
          letterSpacing={Math.max(3, 4 * fontScale)}
          fill="rgba(255,255,255,0.93)"
        >
          {subText}
        </text>
      </svg>
    </div>
  );
}
