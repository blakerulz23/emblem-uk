'use client';

import type { CSSProperties } from 'react';
import {
  WRISTBAND_COLORS,
  isLogoPreset,
  isTextPreset,
  type WristbandActiveEditor,
  type WristbandPresetKind,
  type WristbandState,
} from './data';

function colorOf(id: string) {
  if (id && id.startsWith('#')) {
    const hex = id.length === 4
      ? '#' + id[1] + id[1] + id[2] + id[2] + id[3] + id[3]
      : id;
    let r = 0, g = 0, b = 0;
    try {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } catch {}
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const fg = lum > 0.6 ? '#0b0b0f' : '#ffffff';
    return { id: 'custom', name: 'Custom', bg: hex, fg };
  }
  return WRISTBAND_COLORS.find((c) => c.id === id) || WRISTBAND_COLORS[0];
}

// ──────────────────────────────────────────────────────────
// Band text rendering
// ──────────────────────────────────────────────────────────
function BandText({
  preset,
  text,
  fg,
  height,
}: {
  preset: WristbandPresetKind;
  text: string;
  fg: string;
  height: number;
}) {
  const base: CSSProperties = {
    color: fg,
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    padding: '0 8%',
  };
  const fontH = height * 0.5;
  switch (preset) {
    case 'bold':
      return <span style={{ ...base, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 800, fontSize: fontH * 0.85, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{text}</span>;
    case 'sans-soft':
      return <span style={{ ...base, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 700, fontSize: fontH * 0.95, letterSpacing: '-0.01em' }}>{text}</span>;
    case 'display':
      return <span style={{ ...base, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: fontH * 1.0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{text}</span>;
    case 'verse-ref':
      return <span style={{ ...base, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: fontH * 1.0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{text}</span>;
    case 'serif-heavy':
      return <span style={{ ...base, fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif', fontWeight: 800, fontStyle: 'italic', fontSize: fontH * 1.15, letterSpacing: '-0.01em' }}>{text}</span>;
    case 'script':
      return <span style={{ ...base, fontFamily: '"Brush Script MT", "Snell Roundhand", cursive', fontStyle: 'italic', fontWeight: 600, fontSize: fontH * 1.15, letterSpacing: '0.01em' }}>{text}</span>;
    case 'handwritten':
      return <span style={{ ...base, fontFamily: 'var(--font-caveat), "Marker Felt", "Comic Sans MS", cursive', fontWeight: 700, fontSize: fontH * 1.25 }}>{text}</span>;
    case 'mono-block':
      return <span style={{ ...base, fontFamily: 'var(--font-jbmono), monospace', fontWeight: 600, fontSize: fontH * 0.78, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{text}</span>;
    case 'verse-full':
      return <span style={{ ...base, fontFamily: 'var(--font-manrope), system-ui', fontWeight: 500, fontSize: fontH * 0.36, lineHeight: 1.2, whiteSpace: 'normal', padding: '0 5%' }}>{text}</span>;
    case 'outline':
      return <span style={{ ...base, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: fontH * 1.0, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'transparent', WebkitTextStroke: `1.4px ${fg}` }}>{text}</span>;
    case 'name':
      return <span style={{ ...base, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: fontH * 1.0, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>{text}</span>;
    case 'number':
      return <span style={{ ...base, fontFamily: 'var(--font-sora), system-ui', fontWeight: 800, fontSize: fontH * 1.6, letterSpacing: '-0.04em' }}>{text}</span>;
    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────
// Logo layout rendering
// ──────────────────────────────────────────────────────────
function LogoFill({
  preset,
  src,
  width,
  height,
}: {
  preset: WristbandPresetKind;
  src: string;
  width: number;
  height: number;
}) {
  if (preset === 'logo-centered') {
    const s = height * 0.82;
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            position: 'absolute',
            top: '50%',
            left: '5%',
            width: s,
            height: s,
            transform: 'translateY(-50%)',
            objectFit: 'contain',
          }}
        />
      </div>
    );
  }
  if (preset === 'logo-repeat') {
    const s = height * 0.70;
    const count = Math.max(3, Math.floor(width / (s + 14)));
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-evenly', padding: '0 4%' }}>
        {Array.from({ length: count }).map((_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" style={{ width: s, height: s, objectFit: 'contain', flexShrink: 0 }} />
        ))}
      </div>
    );
  }
  if (preset === 'logo-border') {
    const s = height * 0.32;
    const count = Math.max(8, Math.floor(width / (s + 4)));
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 2, left: 0, right: 0, display: 'flex', justifyContent: 'space-evenly' }}>
          {Array.from({ length: count }).map((_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={'t' + i} src={src} alt="" style={{ width: s, height: s, objectFit: 'contain' }} />
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, display: 'flex', justifyContent: 'space-evenly' }}>
          {Array.from({ length: count }).map((_, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={'b' + i} src={src} alt="" style={{ width: s, height: s, objectFit: 'contain' }} />
          ))}
        </div>
      </div>
    );
  }
  // logo-scatter (default)
  const s = height * 0.46;
  const positions = [
    { x: 0.05, y: 0.15, r: -10 },
    { x: 0.18, y: 0.55, r: 8 },
    { x: 0.32, y: 0.15, r: -6 },
    { x: 0.45, y: 0.55, r: 12 },
    { x: 0.58, y: 0.15, r: -8 },
    { x: 0.70, y: 0.55, r: 6 },
    { x: 0.82, y: 0.15, r: -12 },
    { x: 0.92, y: 0.55, r: 10 },
  ];
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {positions.map((pos, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt=""
          style={{
            position: 'absolute',
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            width: s,
            height: s,
            objectFit: 'contain',
            transform: `translateY(-50%) rotate(${pos.r}deg)`,
            opacity: 0.94,
          }}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Fabric patch (Emblem patch) — rectangular, height = band height, ~1.4× width
// ──────────────────────────────────────────────────────────
function FabricPatch({
  height,
  patch,
  onClick,
  pulseKey,
  pulsing,
}: {
  height: number;
  patch: WristbandState['patch'];
  onClick?: () => void;
  pulseKey?: number;
  pulsing?: boolean;
}) {
  const w = Math.round(height * 1.4);
  const h = height;
  const c = colorOf(patch.colorId);
  const logoSrc = patch.logo.processed || patch.logo.src;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        style={{
          width: w,
          height: h,
          borderRadius: 5,
          position: 'relative',
          background: c.bg,
          backgroundImage:
            c.id === 'white'
              ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.045) 0 1px, transparent 1px 2px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 2px)'
              : 'repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 2px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 2px)',
          boxShadow: '0 4px 10px rgba(11,11,15,.22), inset 0 0 0 1px rgba(0,0,0,.10), inset 0 1px 0 rgba(255,255,255,.7)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        {/* stitched border */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 3,
            borderRadius: 3,
            border: `1px dashed ${c.id === 'white' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.32)'}`,
            pointerEvents: 'none',
          }}
        />

        {patch.kind === 'brand' && (
          <span
            aria-hidden
            style={{
              width: h * 0.34,
              height: h * 0.34,
              background: 'var(--accent)',
              borderRadius: 2,
              transform: 'rotate(45deg)',
              boxShadow: '0 1px 3px var(--accent-glow)',
            }}
          />
        )}
        {patch.kind === 'text' && (
          <span
            style={{
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 800,
              fontSize: h * 0.55,
              letterSpacing: '-0.02em',
              color: c.fg,
              textTransform: 'uppercase',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            {patch.text || ''}
          </span>
        )}
        {patch.kind === 'logo' && logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
        )}
        {patch.kind === 'logo' && !logoSrc && (
          <span style={{ color: c.fg, opacity: 0.45, fontSize: h * 0.22, fontFamily: 'var(--font-jbmono), monospace', letterSpacing: '0.06em' }}>
            LOGO
          </span>
        )}
      </div>

      {/* Pulse-fade selection ring overlay (separate so it can re-trigger via key) */}
      {pulsing && (
        <div
          key={`patch-pulse-${pulseKey}`}
          className="wb-selection-pulse"
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 5,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────
export default function WristbandPreview({
  state,
  width = 320,
  bandHeight = 38,
  interactive = false,
  onTapBand,
  onTapPatch,
  active,
  selectionStamp = 0,
}: {
  state: WristbandState;
  width?: number;
  bandHeight?: number;
  interactive?: boolean;
  onTapBand?: () => void;
  onTapPatch?: () => void;
  active?: WristbandActiveEditor;
  /** Increments on every tap; restarts the pulse-fade animation. */
  selectionStamp?: number;
}) {
  const c = colorOf(state.band.colorId);
  const preset = state.band.preset;
  const isText = isTextPreset(preset);
  const isLogo = isLogoPreset(preset);
  const text = state.band.text || '';
  const logoSrc = state.band.logo.processed || state.band.logo.src;

  const patchW = Math.round(bandHeight * 1.4);
  const patchGap = 8;
  const designAreaRight = patchW + patchGap;

  const pulsingBand = interactive && active === 'band' && selectionStamp > 0;
  const pulsingPatch = interactive && active === 'patch' && selectionStamp > 0;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: width, margin: '0 auto', padding: '14px 0' }}>
      <div
        onClick={interactive ? onTapBand : undefined}
        role={interactive ? 'button' : undefined}
        style={{
          position: 'relative',
          width,
          height: bandHeight,
          borderRadius: 6,
          overflow: 'hidden',
          background: state.band.bandImage ? `url(${state.band.bandImage}) center/cover no-repeat` : c.bg,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12), 0 6px 14px rgba(11,11,15,.18)',
          display: 'flex',
          alignItems: 'center',
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: designAreaRight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {isText && <BandText preset={preset} text={text} fg={c.fg} height={bandHeight} />}
          {isLogo && logoSrc && (
            <LogoFill preset={preset} src={logoSrc} width={width - designAreaRight} height={bandHeight} />
          )}
          {isLogo && !logoSrc && (
            <span style={{ color: c.fg, fontFamily: 'var(--font-jbmono), monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', opacity: 0.55 }}>
              UPLOAD A LOGO
            </span>
          )}
        </div>

        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      </div>

      {/* Pulse-fade ring on the band (separate sibling so its animation can re-trigger) */}
      {pulsingBand && (
        <div
          key={`band-pulse-${selectionStamp}`}
          className="wb-selection-pulse"
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 14,
            width,
            height: bandHeight,
            borderRadius: 6,
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      )}

      {/* Patch on the right */}
      <div style={{ position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', zIndex: 3 }}>
        <FabricPatch
          height={bandHeight}
          patch={state.patch}
          onClick={interactive ? onTapPatch : undefined}
          pulseKey={selectionStamp}
          pulsing={pulsingPatch}
        />
      </div>
    </div>
  );
}
