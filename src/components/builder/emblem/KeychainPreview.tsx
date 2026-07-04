'use client';

import type { CSSProperties } from 'react';
import type { Details, Keychain } from './data';

// Common red-galaxy backdrop matching the manufacturer references.
const HERO_BACKDROP =
  'radial-gradient(120% 100% at 50% 30%, #5b0e10 0%, #2a0508 40%, #0b0306 75%, #000 100%)';

// Subtle gold border accent
const GOLD_GRAD = 'linear-gradient(135deg, #d4a456 0%, #f5d27a 20%, #b07f2a 60%, #d4a456 100%)';

function Photo({
  src,
  style,
}: {
  src: string | null;
  style?: CSSProperties;
}) {
  if (!src) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'rgba(255,255,255,.4)',
          fontFamily: 'var(--font-jbmono), monospace',
          fontSize: 10,
          letterSpacing: '0.1em',
          ...style,
        }}
      >
        ATHLETE PHOTO
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: 'center 28%',
        ...style,
      }}
    />
  );
}

function TeamLogo({
  src,
  size,
  fallbackText,
}: {
  src: string | null;
  size: number;
  fallbackText?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  // Fallback EMBLEM mark inside a small crown-shaped placeholder
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        color: '#f4d68a',
        fontFamily: 'var(--font-sora), system-ui',
        fontWeight: 800,
        fontSize: size * 0.32,
        letterSpacing: '0.05em',
      }}
    >
      {fallbackText || 'KINGS'}
    </div>
  );
}

function Nameplate({
  details,
  city,
  series,
  variant = 'wide',
}: {
  details: Details;
  city: string;
  series: string;
  variant?: 'wide' | 'narrow';
}) {
  const titleSize = variant === 'wide' ? 22 : 17;
  const subSize = variant === 'wide' ? 10 : 9;
  const seriesSize = variant === 'wide' ? 9 : 8.5;
  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, rgba(15,15,18,.85) 0%, rgba(8,8,10,.95) 100%)',
        backgroundImage:
          'linear-gradient(180deg, rgba(15,15,18,.85) 0%, rgba(8,8,10,.95) 100%), repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 4px)',
        borderTop: '1px solid rgba(212,164,86,.6)',
        padding: variant === 'wide' ? '8px 14px 10px' : '6px 10px 8px',
        position: 'relative',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontWeight: 800,
            fontSize: titleSize,
            color: '#f4d68a',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 1px 0 rgba(0,0,0,.6)',
          }}
        >
          {(details.name || 'PLAYER NAME').toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 800,
            fontSize: titleSize * 1.05,
            color: '#f4d68a',
            letterSpacing: '-0.02em',
            flexShrink: 0,
            textShadow: '0 1px 0 rgba(0,0,0,.6)',
          }}
        >
          #{details.number || '00'}
        </span>
      </div>
      <div
        style={{
          marginTop: variant === 'wide' ? 3 : 2,
          fontFamily: 'var(--font-sora), system-ui',
          fontWeight: 700,
          fontSize: subSize,
          letterSpacing: '0.18em',
          color: '#e4d7b5',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center',
        }}
      >
        {[details.position, details.team, city].filter(Boolean).join(' · ')}
      </div>
      <div
        style={{
          marginTop: variant === 'wide' ? 6 : 4,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(212,164,86,.6), transparent)',
        }}
      />
      <div
        style={{
          marginTop: variant === 'wide' ? 5 : 4,
          fontFamily: 'var(--font-jbmono), monospace',
          fontWeight: 600,
          fontSize: seriesSize,
          letterSpacing: '0.18em',
          color: '#cbb988',
          textAlign: 'center',
        }}
      >
        SERIES 1 · {series || '001/250'}
      </div>
    </div>
  );
}

function TopChrome({
  logoSrc,
  team,
  year,
  variant = 'wide',
}: {
  logoSrc: string | null;
  team: string;
  year: string;
  variant?: 'wide' | 'narrow';
}) {
  const w = variant === 'wide' ? 56 : 40;
  return (
    <div
      style={{
        position: 'absolute',
        top: variant === 'wide' ? 14 : 10,
        left: variant === 'wide' ? 18 : 12,
        right: variant === 'wide' ? 18 : 12,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        zIndex: 4,
      }}
    >
      <TeamLogo src={logoSrc} size={w} fallbackText={team} />
      <div
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontFamily: 'var(--font-jbmono), monospace',
          fontWeight: 700,
          fontSize: variant === 'wide' ? 10 : 8.5,
          letterSpacing: '0.22em',
          color: 'rgba(244,214,138,.85)',
          textTransform: 'uppercase',
        }}
      >
        EMBLEM | {year || '2026'}
      </div>
    </div>
  );
}

// ─── Slab label (graded-card style) ─────────────────────────────────
function SlabLabel({
  details,
  city,
  year,
  series,
  height,
}: {
  details: Details;
  city: string;
  year: string;
  series: string;
  height: number;
}) {
  return (
    <div
      style={{
        height,
        background: '#f6f6f8',
        borderTop: '1px solid #dadce2',
        borderBottom: '1px solid #dadce2',
        display: 'flex',
        alignItems: 'stretch',
        padding: '4px 6px 4px 8px',
        gap: 6,
      }}
    >
      <div style={{ width: 4, background: '#dc2626', borderRadius: 2, flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 700,
            fontSize: 7,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#3f3f46',
            lineHeight: 1.15,
          }}
        >
          {year || '2026'} EMBLEM
        </div>
        <div
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 700,
            fontSize: 6.5,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#3f3f46',
            lineHeight: 1.15,
          }}
        >
          {(details.team || 'TEAM').toUpperCase()} BASKETBALL
        </div>
        <div
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 800,
            fontSize: 7.5,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: '#18181b',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {details.name || 'PLAYER'} #{details.number || '00'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 600,
            fontSize: 6,
            letterSpacing: '0.05em',
            color: '#5b5b62',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          SERIES 1 / {city || 'NASHVILLE'} · {series || '001/250'}
        </div>
      </div>
      <div
        style={{
          width: 38,
          borderLeft: '1px solid #dadce2',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
          paddingLeft: 4,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 800,
            fontSize: 6.5,
            letterSpacing: '0.04em',
            color: '#27272a',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          GEM MT
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 800,
            fontSize: 22,
            color: '#dc2626',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          10
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Shape renderers
// ──────────────────────────────────────────────────────────
function Acrylic({
  children,
  style,
  borderRadius,
}: {
  children: React.ReactNode;
  style?: CSSProperties;
  borderRadius?: number | string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: HERO_BACKDROP,
        borderRadius,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* gold inner frame */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 6,
          borderRadius:
            typeof borderRadius === 'number' ? Math.max(0, borderRadius - 6) : borderRadius,
          background: 'transparent',
          boxShadow: 'inset 0 0 0 1.5px rgba(212,164,86,.7), inset 0 0 24px rgba(255,180,80,.05)',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
      {/* acrylic gloss */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.08) 100%)',
          pointerEvents: 'none',
          zIndex: 6,
          mixBlendMode: 'screen',
        }}
      />
      {/* keyring eyelet */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 14,
          height: 14,
          borderRadius: 999,
          background: 'transparent',
          boxShadow: '0 0 0 2px #b9b9c0, inset 0 1px 0 #fff',
          zIndex: 7,
        }}
      />
      {children}
    </div>
  );
}

function CircularKey({
  photo,
  details,
  k,
  size,
}: {
  photo: string | null;
  details: Details;
  k: Keychain;
  size: number;
}) {
  return (
    <Acrylic
      borderRadius={size / 2}
      style={{
        width: size,
        height: size,
        boxShadow: '0 16px 36px rgba(0,0,0,.34)',
        background: HERO_BACKDROP,
      }}
    >
      {/* photo */}
      <div
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          top: '14%',
          bottom: '30%',
          zIndex: 2,
        }}
      >
        <Photo src={photo} style={{ borderRadius: 0 }} />
      </div>
      <TopChrome
        logoSrc={k.logo.processed || k.logo.src}
        team={details.team}
        year={k.year}
        variant="wide"
      />
      {/* nameplate */}
      <div
        style={{
          position: 'absolute',
          left: '6%',
          right: '6%',
          bottom: '8%',
          zIndex: 4,
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(212,164,86,.6)',
        }}
      >
        <Nameplate details={details} city={k.city} series={k.series} variant="narrow" />
      </div>
    </Acrylic>
  );
}

function RectangularKey({
  photo,
  details,
  k,
  width,
}: {
  photo: string | null;
  details: Details;
  k: Keychain;
  width: number;
}) {
  const height = Math.round(width * 1.4);
  return (
    <Acrylic
      borderRadius={Math.round(width * 0.06)}
      style={{
        width,
        height,
        boxShadow: '0 16px 36px rgba(0,0,0,.34)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '6%',
          right: '6%',
          top: '12%',
          bottom: '28%',
          zIndex: 2,
        }}
      >
        <Photo src={photo} />
      </div>
      <TopChrome
        logoSrc={k.logo.processed || k.logo.src}
        team={details.team}
        year={k.year}
        variant="wide"
      />
      <div
        style={{
          position: 'absolute',
          left: '5%',
          right: '5%',
          bottom: '5%',
          zIndex: 4,
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(212,164,86,.6)',
        }}
      >
        <Nameplate details={details} city={k.city} series={k.series} variant="wide" />
      </div>
    </Acrylic>
  );
}

function SlabKey({
  photo,
  details,
  k,
  width,
}: {
  photo: string | null;
  details: Details;
  k: Keychain;
  width: number;
}) {
  // Slab is rectangular but with a graded-label strip on top.
  const labelH = 56;
  const cardH = Math.round(width * 1.32);
  const height = labelH + cardH + 12;
  return (
    <div
      style={{
        width,
        height,
        background: '#f4f4f7',
        borderRadius: Math.round(width * 0.05),
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 16px 36px rgba(0,0,0,.34), inset 0 0 0 1px rgba(0,0,0,.06)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* keyring eyelet on top */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 14,
          height: 14,
          borderRadius: 999,
          background: 'transparent',
          boxShadow: '0 0 0 2px #b9b9c0, inset 0 1px 0 #fff',
          zIndex: 7,
        }}
      />
      {/* gloss */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.18) 100%)',
          pointerEvents: 'none',
          zIndex: 6,
          mixBlendMode: 'screen',
        }}
      />

      <SlabLabel
        details={details}
        city={k.city}
        year={k.year}
        series={k.series}
        height={labelH}
      />

      {/* Inner card sits below label */}
      <div
        style={{
          flex: 1,
          margin: '6px 8px 8px',
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
          background: HERO_BACKDROP,
          boxShadow: 'inset 0 0 0 1px rgba(212,164,86,.6)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '6%',
            right: '6%',
            top: '12%',
            bottom: '30%',
          }}
        >
          <Photo src={photo} />
        </div>
        <TopChrome
          logoSrc={k.logo.processed || k.logo.src}
          team={details.team}
          year={k.year}
          variant="narrow"
        />
        <div
          style={{
            position: 'absolute',
            left: '5%',
            right: '5%',
            bottom: '5%',
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 0 0 1px rgba(212,164,86,.6)',
          }}
        >
          <Nameplate details={details} city={k.city} series={k.series} variant="narrow" />
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────
export default function KeychainPreview({
  photo,
  details,
  keychain,
  size = 220,
}: {
  photo: string | null;
  details: Details;
  keychain: Keychain;
  size?: number;
}) {
  if (keychain.shape === 'circular') {
    return <CircularKey photo={photo} details={details} k={keychain} size={size} />;
  }
  if (keychain.shape === 'rectangular') {
    return <RectangularKey photo={photo} details={details} k={keychain} width={size} />;
  }
  return <SlabKey photo={photo} details={details} k={keychain} width={size} />;
}

// Re-export gold gradient for any external use
export { GOLD_GRAD };
