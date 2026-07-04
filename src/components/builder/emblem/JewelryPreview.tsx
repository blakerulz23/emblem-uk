'use client';

import {
  JEWELRY_MATERIALS,
  type Jewelry,
  type JewelryMaterial,
} from './data';

function getMaterial(id: string): JewelryMaterial {
  return JEWELRY_MATERIALS.find((m) => m.id === id) || JEWELRY_MATERIALS[0];
}

// ──────────────────────────────────────────────────────────
// Chain — small ovals tiled along an SVG path
// ──────────────────────────────────────────────────────────
function ChainPath({
  d,
  material,
  linkSize = 3,
  density = 0.85,
}: {
  d: string;
  material: JewelryMaterial;
  linkSize?: number;
  density?: number;
}) {
  // We approximate a chain by stroking the path with a dashed line that mimics
  // chain links. Each "dash" is a small oval; the gap between links is set by
  // `density`.
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={material.dark}
        strokeWidth={linkSize * 0.8}
        strokeLinecap="round"
        strokeDasharray={`${linkSize * density} ${linkSize * 0.7}`}
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={material.base}
        strokeWidth={linkSize * 0.55}
        strokeLinecap="round"
        strokeDasharray={`${linkSize * density} ${linkSize * 0.7}`}
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={material.highlight}
        strokeWidth={linkSize * 0.18}
        strokeLinecap="round"
        strokeDasharray={`${linkSize * 0.4} ${linkSize * 1.1}`}
        strokeLinejoin="round"
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Bail (small loop connecting chain to pendant — necklace only)
// ──────────────────────────────────────────────────────────
function Bail({
  cx,
  cy,
  size,
  material,
}: {
  cx: number;
  cy: number;
  size: number;
  material: JewelryMaterial;
}) {
  const w = size;
  const h = size * 1.3;
  return (
    <>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={w / 2}
        fill={`url(#bail-grad-${material.id})`}
        stroke={material.dark}
        strokeWidth={0.6}
      />
      <rect
        x={cx - w / 2 + 2}
        y={cy - h / 2 + 2}
        width={w - 4}
        height={h - 4}
        rx={(w - 4) / 2}
        fill="none"
        stroke={material.dark}
        strokeWidth={0.5}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Pendant (circular or rectangular) with photo inside
// ──────────────────────────────────────────────────────────
function Pendant({
  shape,
  material,
  photo,
  cx,
  cy,
  diameter,
}: {
  shape: 'circular' | 'rectangular';
  material: JewelryMaterial;
  photo: string | null;
  cx: number;
  cy: number;
  diameter: number;
}) {
  const rim = Math.max(2.4, diameter * 0.045);
  if (shape === 'circular') {
    const r = diameter / 2;
    return (
      <>
        {/* outer rim */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#metal-grad-${material.id})`}
          stroke={material.dark}
          strokeWidth={0.8}
        />
        {/* inner cutout area where photo goes */}
        <defs>
          <clipPath id={`pendant-clip-${material.id}`}>
            <circle cx={cx} cy={cy} r={r - rim} />
          </clipPath>
        </defs>
        {/* inner base (slightly darker so photo sits well) */}
        <circle cx={cx} cy={cy} r={r - rim} fill="#f1f1f3" />
        {photo && (
          <image
            href={photo}
            x={cx - (r - rim)}
            y={cy - (r - rim)}
            width={(r - rim) * 2}
            height={(r - rim) * 2}
            preserveAspectRatio="xMidYMid meet"
            clipPath={`url(#pendant-clip-${material.id})`}
          />
        )}
        {/* gloss arc */}
        <path
          d={`M ${cx - r * 0.7} ${cy - r * 0.55} Q ${cx} ${cy - r * 0.9} ${cx + r * 0.7} ${cy - r * 0.55}`}
          fill="none"
          stroke={material.highlight}
          strokeWidth={r * 0.07}
          strokeOpacity={0.45}
          strokeLinecap="round"
        />
        {/* inner rim border */}
        <circle
          cx={cx}
          cy={cy}
          r={r - rim}
          fill="none"
          stroke={material.dark}
          strokeWidth={0.6}
        />
      </>
    );
  }
  // rectangular pendant
  const w = diameter;
  const h = diameter * 1.25;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rx = diameter * 0.08;
  return (
    <>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        fill={`url(#metal-grad-${material.id})`}
        stroke={material.dark}
        strokeWidth={0.8}
      />
      <defs>
        <clipPath id={`pendant-clip-${material.id}`}>
          <rect x={x + rim} y={y + rim} width={w - rim * 2} height={h - rim * 2} rx={rx * 0.6} />
        </clipPath>
      </defs>
      <rect
        x={x + rim}
        y={y + rim}
        width={w - rim * 2}
        height={h - rim * 2}
        rx={rx * 0.6}
        fill="#f1f1f3"
      />
      {photo && (
        <image
          href={photo}
          x={x + rim}
          y={y + rim}
          width={w - rim * 2}
          height={h - rim * 2}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#pendant-clip-${material.id})`}
        />
      )}
      {/* gloss */}
      <path
        d={`M ${x + rim + 4} ${y + rim + h * 0.18} Q ${x + w / 2} ${y + rim - 2} ${x + w - rim - 4} ${y + rim + h * 0.18}`}
        fill="none"
        stroke={material.highlight}
        strokeWidth={2.5}
        strokeOpacity={0.4}
        strokeLinecap="round"
      />
      <rect
        x={x + rim}
        y={y + rim}
        width={w - rim * 2}
        height={h - rim * 2}
        rx={rx * 0.6}
        fill="none"
        stroke={material.dark}
        strokeWidth={0.6}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Necklace
// ──────────────────────────────────────────────────────────
function Necklace({
  jewelry,
  width,
  height,
}: {
  jewelry: Jewelry;
  width: number;
  height: number;
}) {
  const m = getMaterial(jewelry.material);
  const photo = jewelry.logo.processed || jewelry.logo.src;
  const cx = width / 2;
  const pendantDiameter = Math.min(width * 0.46, height * 0.42);
  // chain V — from top corners to a point above the pendant
  const bailY = height * 0.45;
  const bailH = pendantDiameter * 0.14;
  const pendantCy = bailY + bailH * 0.6 + pendantDiameter / 2 + 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`metal-grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.highlight} />
          <stop offset="0.5" stopColor={m.base} />
          <stop offset="1" stopColor={m.dark} />
        </linearGradient>
        <linearGradient id={`bail-grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.highlight} />
          <stop offset="1" stopColor={m.dark} />
        </linearGradient>
      </defs>
      {/* chain V */}
      <ChainPath
        d={`M ${width * 0.02} ${height * 0.02} Q ${cx - 4} ${bailY * 0.6} ${cx - 2} ${bailY}`}
        material={m}
      />
      <ChainPath
        d={`M ${width * 0.98} ${height * 0.02} Q ${cx + 4} ${bailY * 0.6} ${cx + 2} ${bailY}`}
        material={m}
      />
      {/* bail */}
      <Bail cx={cx} cy={bailY + bailH * 0.5} size={pendantDiameter * 0.14} material={m} />
      {/* pendant */}
      <Pendant
        shape={jewelry.shape}
        material={m}
        photo={photo}
        cx={cx}
        cy={pendantCy}
        diameter={pendantDiameter}
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// Bracelet (chain passes through pendant on left + right)
// ──────────────────────────────────────────────────────────
function Bracelet({
  jewelry,
  width,
  height,
}: {
  jewelry: Jewelry;
  width: number;
  height: number;
}) {
  const m = getMaterial(jewelry.material);
  const photo = jewelry.logo.processed || jewelry.logo.src;
  const cy = height / 2;
  const cx = width / 2;
  const pendantDiameter = Math.min(width * 0.22, height * 0.72);
  const halfP = pendantDiameter / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`metal-grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.highlight} />
          <stop offset="0.5" stopColor={m.base} />
          <stop offset="1" stopColor={m.dark} />
        </linearGradient>
        <linearGradient id={`bail-grad-${m.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.highlight} />
          <stop offset="1" stopColor={m.dark} />
        </linearGradient>
      </defs>
      {/* left chain with clasp ring */}
      <circle cx={width * 0.08} cy={cy - height * 0.18} r={6} fill={`url(#metal-grad-${m.id})`} stroke={m.dark} strokeWidth={0.6} />
      <ChainPath
        d={`M ${width * 0.08} ${cy - height * 0.18 + 6} Q ${width * 0.15} ${cy - 6} ${cx - halfP - 2} ${cy}`}
        material={m}
        linkSize={2.6}
      />
      {/* right chain */}
      <ChainPath
        d={`M ${cx + halfP + 2} ${cy} Q ${width * 0.78} ${cy + 4} ${width * 0.92} ${cy + height * 0.05}`}
        material={m}
        linkSize={2.6}
      />
      {/* tiny tail */}
      <ChainPath
        d={`M ${width * 0.92} ${cy + height * 0.05} l 18 14`}
        material={m}
        linkSize={2.2}
      />
      {/* pendant (no bail — chain runs through holes on left/right) */}
      <Pendant
        shape={jewelry.shape}
        material={m}
        photo={photo}
        cx={cx}
        cy={cy}
        diameter={pendantDiameter}
      />
      {/* tiny mount holes either side */}
      <circle cx={cx - halfP + 4} cy={cy} r={1.6} fill={m.dark} />
      <circle cx={cx + halfP - 4} cy={cy} r={1.6} fill={m.dark} />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────
export default function JewelryPreview({
  jewelry,
  size = 240,
}: {
  jewelry: Jewelry;
  size?: number;
}) {
  if (jewelry.type === 'necklace') {
    return <Necklace jewelry={jewelry} width={size} height={Math.round(size * 1.15)} />;
  }
  return <Bracelet jewelry={jewelry} width={size * 1.45} height={Math.round(size * 0.55)} />;
}
