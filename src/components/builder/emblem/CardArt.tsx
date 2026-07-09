// Card art renderer — Phase 3.
// Real PNG templates (Futuristic / Chrome / Galaxy) use CSS layer compositing.
// Procedural CSS templates (Prism / Carbon / Aurora / Clean / Spectrum / Mono) are kept as fallback.
import type { CSSProperties } from 'react';
import { getCustomCollectionVariant } from '@/lib/custom-collection-manifest';
import { getHollinwoodVariant } from '@/lib/hollinwood-manifest';
import { SPORT_STATS, type CardTemplate, type Details, type Family, type SportId } from './data';
import Icon from './Icon';

type Style = {
  bg: string;
  ink: string;
  sub: string;
  foil: boolean;
  frame: string;
  carbon?: boolean;
  light?: boolean;
  mono?: boolean;
};

function familyStyle(fam: Family, accent: string): Style {
  switch (fam) {
    case 'Prism':
      return {
        bg: `radial-gradient(140% 120% at 30% 0%, #fff 0%, ${accent}26 35%, #11121a 100%)`,
        ink: '#fff',
        sub: 'rgba(255,255,255,.7)',
        foil: true,
        frame: 'rgba(255,255,255,.5)',
      };
    case 'Carbon':
      return {
        bg: 'linear-gradient(160deg,#1a1c22 0%,#0b0c10 100%)',
        ink: '#fff',
        sub: 'rgba(255,255,255,.6)',
        foil: false,
        frame: accent,
        carbon: true,
      };
    case 'Aurora':
      return {
        bg: `radial-gradient(120% 100% at 80% 10%, ${accent}55 0%, transparent 55%), radial-gradient(120% 100% at 10% 90%, ${accent}33 0%, transparent 50%), #0c0d12`,
        ink: '#fff',
        sub: 'rgba(255,255,255,.65)',
        foil: false,
        frame: 'rgba(255,255,255,.18)',
      };
    case 'Clean':
      return {
        bg: '#ffffff',
        ink: '#0b0b0f',
        sub: 'rgba(11,11,15,.5)',
        foil: false,
        frame: 'rgba(11,11,15,.1)',
        light: true,
      };
    case 'Spectrum':
      return {
        bg: `linear-gradient(135deg, ${accent} 0%, ${accent} 48%, #fff 48%, #fff 100%)`,
        ink: '#0b0b0f',
        sub: 'rgba(11,11,15,.55)',
        foil: false,
        frame: 'rgba(11,11,15,.08)',
        light: true,
      };
    case 'Mono':
    default:
      return {
        bg: '#0b0b0f',
        ink: '#fff',
        sub: 'rgba(255,255,255,.55)',
        foil: false,
        frame: accent,
        mono: true,
      };
  }
}

// ── Real PNG card renderer ───────────────────────────────────────────────────
// Uses CSS absolute-positioned layers — bg → photo → frame → overlays → text.
// No canvas overhead, works in gallery grid at any thumbnail size.

function RealCardArt({
  template,
  photo,
  details,
  size = 240,
  selected,
  dim,
  style,
  logo,
  stats,
  sport = 'basketball',
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  logo?: string | null;
  stats?: Record<string, string>;
  sport?: SportId;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
}) {
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);
  const isGalaxy = template.family === 'Galaxy';
  const isVintage = template.family === 'Vintage';
  const isChampions = template.family === 'Champions';
  const frontStats = SPORT_STATS[sport] || SPORT_STATS.basketball;
  const galaxyVariant = template.id.replace('galaxy-', '');
  const galaxyLightVariants = new Set(['bronze', 'gold', 'ice', 'lime', 'mint', 'neon-cyan', 'neon-green', 'silver', 'sky-blue', 'teal', 'white']);
  const galaxyMetaColor = galaxyLightVariants.has(galaxyVariant) ? '#050505' : '#ffffff';
  const galaxyMetaShadow = galaxyLightVariants.has(galaxyVariant)
    ? '0 1px 0 rgba(255,255,255,.75), 0 2px 6px rgba(255,255,255,.45)'
    : '0 1px 0 rgba(0,0,0,.9), 0 2px 7px rgba(0,0,0,.85)';

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.05,
        position: 'relative',
        overflow: 'hidden',
        background: '#0a0a0f',
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.3)`
          : '0 10px 30px rgba(0,0,0,.2)',
        flexShrink: 0,
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        opacity: dim ? 0.5 : 1,
        ...style,
      }}
    >
      {/* Layer 1: background */}
      {template.bgPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.bgPath} alt="" style={{ ...layer, zIndex: 1 }} />
      )}

      {/* Layer 1.5: vintage photo-area background — behind player photo */}
      {isVintage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/templates/vintage/photo-bg.png" alt="" style={{ ...layer, zIndex: 2 }} />
      )}

      {/* Layer 2: player photo — scale + offset via transform */}
      {photo && (
        <div
          style={{
            ...layer,
            zIndex: 2,
            overflow: 'hidden',
            ...(isGalaxy
              ? { clipPath: 'inset(2.2% 3.2% 3.2% 3.2% round 2%)' }
              : isVintage
              ? { clipPath: 'inset(12.6% 7.7% 19.2% 7.6%)' }
              : null),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 10%',
              transformOrigin: 'center center',
              transform: `translate(${photoOffsetX}%, ${photoOffsetY}%) scale(${photoScale})`,
            }}
          />
        </div>
      )}

      {/* Champions layer stack (all sit above photo at zIndex 2) */}
      {isChampions && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/templates/champions/headline.png" alt="" style={{ ...layer, zIndex: 3 }} />
      )}
      {isChampions && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/templates/champions/border-mvp.png" alt="" style={{ ...layer, zIndex: 4 }} />
      )}
      {isChampions && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/templates/champions/badge.png" alt="" style={{ ...layer, zIndex: 5 }} />
      )}

      {/* Layer 3: frame (transparent interior — sits on top of photo) */}
      {template.framePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.framePath} alt="" style={{ ...layer, zIndex: 3 }} />
      )}

      {/* Layer 4: badge / top badge */}
      {template.badgePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.badgePath} alt="" style={{ ...layer, zIndex: 4 }} />
      )}

      {/* Layer 5: top banner */}
      {template.topBannerPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.topBannerPath} alt="" style={{ ...layer, zIndex: 5 }} />
      )}

      {/* Layer 6: nameplate */}
      {template.nameplatePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.nameplatePath} alt="" style={{ ...layer, zIndex: 6 }} />
      )}

      {/* Layer 7: stat panel */}
      {template.statPanelPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.statPanelPath} alt="" style={{ ...layer, zIndex: 7 }} />
      )}

      {/* Layer 8: NFC icon */}
      {template.nfcIconPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.nfcIconPath} alt="" style={{ ...layer, zIndex: 8 }} />
      )}

      {isGalaxy && template.framePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.framePath} alt="" style={{ ...layer, zIndex: 9, pointerEvents: 'none' }} />
      )}

      {isGalaxy && template.badgePath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.badgePath} alt="" style={{ ...layer, zIndex: 9, pointerEvents: 'none' }} />
      )}

      {isGalaxy && template.topBannerPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={template.topBannerPath} alt="" style={{ ...layer, zIndex: 9, pointerEvents: 'none' }} />
      )}

      {/* ── Futuristic text overlays — pixel-accurate to 1060×1484 spec ── */}
      {template.family === 'Futuristic' && (
        <>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              style={{
                position: 'absolute',
                left: '21.6%',
                top: '13.8%',
                width: W * 0.23,
                height: W * 0.23,
                transform: 'translate(-50%, -50%)',
                objectFit: 'contain',
                zIndex: 10,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 3px 7px rgba(0,0,0,.7))',
              }}
            />
          )}

          {/* Jersey number — centred at (854, 192) on 1060×1484 */}
          <div
            style={{
              position: 'absolute',
              left: '80.6%',
              top: '12.9%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#ffffff',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 800,
              fontSize: W * 0.11,
              lineHeight: 1,
              textShadow: '0 2px 6px rgba(0,0,0,.7)',
              whiteSpace: 'nowrap',
            }}
          >
            {d.number || '23'}
          </div>

          {/* Player name — centred at (531, 1128) on 1060×1484 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '73.6%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#ffffff',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 700,
              fontSize: W * 0.076,
              lineHeight: 1,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              textShadow: '0 2px 8px rgba(0,0,0,.8)',
            }}
          >
            {d.name || 'Your Name'}
          </div>

          {/* Team · Position — centred at (531, 1222) on 1060×1484 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '80.5%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: template.accent,
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 600,
              fontSize: W * 0.046,
              lineHeight: 1,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {(d.team || 'Eastside Hawks') + ' · ' + (d.position || 'GUARD')}
          </div>

          {frontStats.map((stat, i) => {
            const xs = ['29.8%', '50%', '69.7%'];
            const value = stats?.[stat.key] || '—';
            return (
              <div
                key={stat.key}
                style={{
                  position: 'absolute',
                  left: xs[i],
                  top: '89.7%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none',
                  textAlign: 'center',
                  minWidth: W * 0.17,
                }}
              >
                <div
                  style={{
                    color: '#ffffff',
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 800,
                    fontSize: W * 0.052,
                    lineHeight: 1,
                    textShadow: '0 1px 5px rgba(0,0,0,.75)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    marginTop: W * 0.006,
                    color: template.accent,
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 700,
                    fontSize: W * 0.022,
                    lineHeight: 1,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    textShadow: '0 1px 4px rgba(0,0,0,.8)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Vintage text overlays — pixel-accurate to 1065×1477 spec ── */}
      {isVintage && (
        <>
          {/* Player name — top left, x=76 y=44-117 */}
          <div style={{ position: 'absolute', left: '7.1%', top: '3.0%', zIndex: 10, pointerEvents: 'none', color: '#ffffff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800, fontSize: W * 0.07, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', textShadow: '0 2px 6px rgba(0,0,0,.5)' }}>
            {d.name || 'Player Name'}
          </div>
          {/* Position — x=76 y=8.7% */}
          <div style={{ position: 'absolute', left: '7.1%', top: '8.7%', zIndex: 10, pointerEvents: 'none', color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 400, fontSize: W * 0.036, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {d.position || 'Position'}
          </div>
          {/* Team logo — top right, center 76.3% / 12.9% */}
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" style={{ position: 'absolute', left: '76.3%', top: '12.9%', width: W * 0.334, height: W * 0.322, transform: 'translate(-50%, -50%)', objectFit: 'contain', zIndex: 10, pointerEvents: 'none' }} />
          )}
          {/* Stat values + labels */}
          {(['23.5%', '50.9%', '76.4%'] as const).map((cx, i) => {
            const stat = frontStats[i];
            const value = stats?.[stat?.key] || '—';
            return (
              <div key={i} style={{ position: 'absolute', left: cx, top: '84.7%', transform: 'translate(-50%, -50%)', zIndex: 10, pointerEvents: 'none', textAlign: 'center' }}>
                <div style={{ color: '#E86E00', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800, fontSize: W * 0.076, lineHeight: 1, whiteSpace: 'nowrap' }}>{value}</div>
              </div>
            );
          })}
          {frontStats.map((stat, i) => {
            const labelX = ['24.2%', '51.0%', '76.6%'][i];
            return (
              <div key={stat.key} style={{ position: 'absolute', left: labelX, top: '89.7%', transform: 'translate(-50%, -50%)', zIndex: 10, pointerEvents: 'none', color: '#F5D9A8', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700, fontSize: W * 0.028, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {stat.label}
              </div>
            );
          })}
          {/* Team name */}
          <div style={{ position: 'absolute', left: '50%', top: '93.8%', transform: 'translate(-50%, -50%)', zIndex: 10, pointerEvents: 'none', color: '#E86E00', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700, fontSize: W * 0.025, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {d.team || 'Team Name'}
          </div>
        </>
      )}

      {/* ── Chrome / other real templates — approximate nameplate positions ── */}
      {isGalaxy && (
        <>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              style={{
                position: 'absolute',
                left: '15.5%',
                top: '10.6%',
                width: W * 0.18,
                height: W * 0.18,
                transform: 'translate(-50%, -50%)',
                objectFit: 'contain',
                zIndex: 10,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.3))',
              }}
            />
          )}

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '4.2%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#050505',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 800,
              fontSize: W * 0.026,
              lineHeight: 1,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            YOUTHCARDS
          </div>

          <div
            style={{
              position: 'absolute',
              left: '79%',
              top: '14.3%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#050505',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 900,
              fontSize: W * 0.105,
              lineHeight: 1,
              textShadow: '0 2px 7px rgba(0,0,0,.8)',
              whiteSpace: 'nowrap',
            }}
          >
            {d.number || '23'}
          </div>

          <div
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              top: '62.6%',
              height: '10.6%',
              zIndex: 10,
              pointerEvents: 'none',
              background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.30) 14%, rgba(18,20,30,.30) 50%, rgba(0,0,0,.30) 86%, rgba(0,0,0,0) 100%)',
              boxShadow: '0 4px 14px rgba(0,0,0,.17), inset 0 1px 0 rgba(255,255,255,.20)',
              borderTop: '1px solid rgba(255,255,255,.40)',
              borderBottom: '1px solid rgba(255,255,255,.30)',
              backdropFilter: 'saturate(1.25) brightness(1.06)',
            }}
          />

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '66.9%',
              transform: 'translate(-50%, -50%) skewX(-13deg) scaleX(1.06)',
              width: '80%',
              zIndex: 12,
              pointerEvents: 'none',
              textAlign: 'center',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 900,
              fontSize: W * 0.1098,
              fontStyle: 'italic',
              lineHeight: 1,
              letterSpacing: '0.008em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              filter: 'drop-shadow(0 5px 8px rgba(0,0,0,.78)) drop-shadow(0 0 9px rgba(255,255,255,.42))',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                color: 'transparent',
                WebkitTextStroke: `${Math.max(7, W * 0.020)}px rgba(255,255,255,.88)`,
              }}
            >
              {d.name || 'Your Name'}
            </span>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                color: 'transparent',
                WebkitTextStroke: `${Math.max(6, W * 0.015)}px #050505`,
              }}
            >
              {d.name || 'Your Name'}
            </span>
            <span
              style={{
                position: 'relative',
                display: 'block',
                color: '#ffffff',
                backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #dce8f5 32%, #ffffff 48%, #a9b7c9 70%, #f4f7ff 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                WebkitTextStroke: `${Math.max(0.75, W * 0.002)}px rgba(255,255,255,.62)`,
                textShadow: '0 -1px 0 rgba(255,255,255,.75), 0 1px 0 rgba(0,0,0,.42), 0 0 12px rgba(188,225,255,.55)',
              }}
            >
              {d.name || 'Your Name'}
            </span>
          </div>

          <div
            style={{
              position: 'absolute',
              left: '18%',
              right: '18%',
              top: '71.0%',
              height: 1,
              zIndex: 13,
              pointerEvents: 'none',
              opacity: 0.9,
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.92) 15%, rgba(255,255,255,.92) 85%, rgba(255,255,255,0) 100%)',
              boxShadow: '0 1px 3px rgba(0,0,0,.65)',
            }}
          />

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '72.2%',
              transform: 'translate(-50%, -50%)',
              zIndex: 13,
              pointerEvents: 'none',
              color: '#FFFFFF',
              WebkitTextStroke: `${Math.max(0.75, W * 0.0028)}px #050505`,
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 600,
              fontSize: W * 0.051,
              lineHeight: 1,
              letterSpacing: '0.248em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              textAlign: 'center',
              opacity: 0.96,
              textShadow: '0 1px 0 rgba(0,0,0,.9), 0 2px 5px rgba(0,0,0,.78)',
            }}
          >
            {(d.team || 'Eastside Hawks') + ' · ' + (d.position || 'GUARD')}
          </div>

          {frontStats.map((stat, i) => {
            const xs = ['24.5%', '49.8%', '75.2%'];
            const value = stats?.[stat.key] || '—';
            return (
              <div
                key={stat.key}
                style={{
                  position: 'absolute',
                  left: xs[i],
                  top: '81.2%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none',
                  textAlign: 'center',
                  minWidth: W * 0.19,
                }}
              >
                <div
                  style={{
                    color: '#050505',
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 900,
                    fontSize: W * 0.062,
                    lineHeight: 1,
                    textShadow: '0 2px 7px rgba(0,0,0,.85)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    marginTop: W * 0.01,
                    color: '#050505',
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 800,
                    fontSize: W * 0.028,
                    lineHeight: 1,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    textShadow: '0 1px 4px rgba(0,0,0,.85)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ── Champions overlays ── */}
      {/* Team logo inside badge circle — center 49.7% / 80.2%, badge circle ≈ 16% wide */}
      {isChampions && logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          style={{
            position: 'absolute',
            left: '49.7%',
            top: '80.2%',
            width: W * 0.13,
            height: W * 0.13,
            transform: 'translate(-50%, -50%)',
            objectFit: 'contain',
            zIndex: 11,
            pointerEvents: 'none',
            borderRadius: '50%',
          }}
        />
      )}

      {/* Player name bottom-left, pixel-accurate to 1065×1477 */}
      {isChampions && (
        <div
          style={{
            position: 'absolute',
            left: '15.3%',
            top: '89.4%',
            zIndex: 10,
            pointerEvents: 'none',
            color: '#0B2448',
            fontFamily: 'var(--font-oswald), system-ui',
            fontWeight: 800,
            fontSize: W * 0.038,
            lineHeight: 1.1,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            letterSpacing: '0.01em',
          }}
        >
          {(() => {
            const parts = (d.name || 'Player Name').split(' ');
            const first = parts[0];
            const rest = parts.slice(1).join(' ') || '';
            return <>{first}{rest && <><br />{rest}</>}</>;
          })()}
        </div>
      )}

      {template.family === 'Chrome' && template.bgPath && (
        <>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              style={{
                position: 'absolute',
                left: '16.2%',
                top: '13.2%',
                width: W * 0.16,
                height: W * 0.16,
                transform: 'translate(-50%, -50%)',
                objectFit: 'contain',
                zIndex: 10,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.55))',
              }}
            />
          )}

          <div
            style={{
              position: 'absolute',
              left: '82.4%',
              top: '14.2%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#B8C0CC',
              WebkitTextStroke: `${Math.max(1, W * 0.006)}px #ffffff`,
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 900,
              fontSize: W * 0.12,
              lineHeight: 1,
              textShadow: '0 2px 7px rgba(0,0,0,.65)',
              whiteSpace: 'nowrap',
            }}
          >
            {d.number || '23'}
          </div>

          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '68.6%',
              transform: 'translateX(-50%)',
              width: '82%',
              zIndex: 10,
              pointerEvents: 'none',
              color: '#ffffff',
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 700,
              fontSize: W * 0.076,
              lineHeight: 1,
              textAlign: 'center',
              textTransform: 'uppercase',
              textShadow: '0 2px 8px rgba(0,0,0,.8)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {d.name || 'Your Name'}
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '74.8%',
              transform: 'translateX(-50%)',
              width: '82%',
              zIndex: 10,
              pointerEvents: 'none',
              color: template.accent,
              fontFamily: 'var(--font-oswald), system-ui',
              fontWeight: 600,
              fontSize: W * 0.046,
              lineHeight: 1,
              letterSpacing: '0.08em',
              textAlign: 'center',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {(d.team || 'Team') + ' · ' + (d.position || 'POS')}
          </div>

          {frontStats.map((stat, i) => {
            const xs = ['25%', '50%', '75%'];
            const value = stats?.[stat.key] || '-';
            return (
              <div
                key={stat.key}
                style={{
                  position: 'absolute',
                  left: xs[i],
                  top: '86.8%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  pointerEvents: 'none',
                  textAlign: 'center',
                  minWidth: W * 0.18,
                }}
              >
                <div
                  style={{
                    color: '#ffffff',
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 900,
                    fontSize: W * 0.034,
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    textShadow: '0 1px 4px rgba(0,0,0,.75)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    marginTop: W * 0.012,
                    color: '#B8C0CC',
                    WebkitTextStroke: `${Math.max(1, W * 0.004)}px #ffffff`,
                    fontFamily: 'var(--font-oswald), system-ui',
                    fontWeight: 900,
                    fontSize: W * 0.104,
                    fontStyle: 'italic',
                    lineHeight: 1,
                    textShadow: '0 2px 7px rgba(0,0,0,.65)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {value}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Back card renderer — futuristic-back PNG layers ─────────────────────────
// Pixel coords reference: 1060 × 1484 canonical canvas.

function RealCardBack({
  details,
  logo,
  stats,
  backText,
  physical,
  accent,
  size = 240,
  selected,
  dim,
  style,
}: {
  details: Details | null;
  logo?: string | null;
  stats?: Record<string, string>;
  backText?: string;
  physical?: Record<string, string>;
  accent?: string;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);
  const gold = accent || '#C8A84B';

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  const statKeys = stats ? Object.entries(stats) : [];

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.05,
        position: 'relative',
        overflow: 'hidden',
        background: '#0a0a0f',
        boxShadow: selected
          ? `0 0 0 2.5px ${gold}, 0 18px 40px rgba(0,0,0,.3)`
          : '0 10px 30px rgba(0,0,0,.2)',
        flexShrink: 0,
        transition: 'opacity .25s ease',
        opacity: dim ? 0.5 : 1,
        ...style,
      }}
    >
      {/* Layer stack */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/futuristic-back/background.png" alt="" style={{ ...layer, zIndex: 1 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/futuristic-back/frame.png" alt="" style={{ ...layer, zIndex: 2 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/futuristic-back/stat-boxes-empty.png" alt="" style={{ ...layer, zIndex: 4 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/futuristic-back/physical-stats.png" alt="" style={{ ...layer, zIndex: 5 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/futuristic-back/footer-plate.png" alt="" style={{ ...layer, zIndex: 6 }} />

      {/* Logo — centred at cx=530, cy=209 → 50%, 14% */}
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" style={{ position: 'absolute', left: '50%', top: '11%', transform: 'translate(-50%,-50%)', width: W * 0.17, height: W * 0.22, objectFit: 'contain', zIndex: 8 }} />
      )}

      {/* Player name — centred at cx=530, cy=364 → 50%, 21% */}
      <div style={{ position: 'absolute', left: '50%', top: '21%', transform: 'translate(-50%,-50%)', zIndex: 9, color: gold, fontFamily: 'var(--font-oswald),system-ui', fontWeight: 900, fontSize: W * 0.085, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {d.name || 'PLAYER NAME'}
      </div>

      {/* Position — centred at cx=530, cy=451 → 50%, 27% */}
      <div style={{ position: 'absolute', left: '50%', top: '27%', transform: 'translate(-50%,-50%)', zIndex: 9, color: '#E53935', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 600, fontSize: W * 0.037, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {d.position || 'POSITION'}
      </div>

      {/* Bio text — x=75, y=535 → left 7%, top 36% */}
      {backText && (
        <div style={{ position: 'absolute', left: '15%', right: '15%', top: '36.2%', zIndex: 9, color: '#ffffff', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 400, fontSize: W * 0.03, lineHeight: 1.42, textAlign: 'center', pointerEvents: 'none', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {backText}
        </div>
      )}

      {/* Stat boxes — cx=[288,533,775] → 27.2%, 50.3%, 73.1% ; cy=914 → 61.6% */}
      {statKeys.slice(0, 3).map(([key, val], i) => {
        const xs = ['27.2%', '50.3%', '73.1%'];
        return (
          <div key={key} style={{ position: 'absolute', left: xs[i], top: '61.6%', transform: 'translate(-50%,-50%)', zIndex: 9, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ color: gold, fontFamily: 'var(--font-oswald),system-ui', fontWeight: 700, fontSize: W * 0.033, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>{key.toUpperCase()}</div>
            <div style={{ color: '#fff', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 900, fontSize: W * 0.072, lineHeight: 1.1 }}>{val || '—'}</div>
          </div>
        );
      })}

      {/* Physical stats — values at x=578 → 54.5% */}
      {(['height', 'age', 'classYear', 'hometown'] as const).map((k, i) => {
        const tops = ['69.3%', '74.1%', '79.0%', '83.9%'];
        const val = physical?.[k] || '';
        if (!val) return null;
        return (
          <div key={k} style={{ position: 'absolute', left: '54.5%', top: tops[i], transform: 'translateY(-50%)', zIndex: 9, color: '#fff', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 600, fontSize: W * 0.032, pointerEvents: 'none' }}>
            {val}
          </div>
        );
      })}

      {/* Footer card ID — cx=530, cy=1378 → 50%, 92.8% */}
      <div style={{ position: 'absolute', left: '50%', top: '92.8%', transform: 'translate(-50%,-50%)', zIndex: 9, color: gold, fontFamily: 'var(--font-oswald),system-ui', fontWeight: 600, fontSize: W * 0.032, letterSpacing: '0.08em', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        ★ {(d.name || 'EMBLEM').toUpperCase().slice(0, 12)} ★
      </div>
    </div>
  );
}

function RealGalaxyBack({
  details,
  logo,
  stats,
  backText,
  physical,
  size = 240,
  selected,
  dim,
  style,
}: {
  details: Details | null;
  logo?: string | null;
  stats?: Record<string, string>;
  backText?: string;
  physical?: Record<string, string>;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const H = Math.round(size * 1.415);
  const d = details || ({} as Partial<Details>);

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  const statKeys = stats ? Object.entries(stats).slice(0, 3) : [];
  const physicalRows = [
    { label: 'AGE', value: physical?.age },
    { label: 'CLASS', value: physical?.classYear },
    { label: 'HEIGHT', value: physical?.height },
    { label: 'HOMETOWN', value: physical?.hometown },
    { label: 'BATS / THROWS', value: '' },
    { label: 'TEAM', value: d.team },
  ];

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.05,
        position: 'relative',
        overflow: 'hidden',
        background: '#f7f8fb',
        boxShadow: selected
          ? '0 0 0 2.5px #8CD7FF, 0 18px 40px rgba(0,0,0,.25)'
          : '0 10px 30px rgba(0,0,0,.16)',
        flexShrink: 0,
        transition: 'opacity .25s ease',
        opacity: dim ? 0.5 : 1,
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/galaxy-holo/back/01_back_background_texture.png" alt="" style={{ ...layer, zIndex: 1 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/galaxy-holo/back/03_back_brand_logo.png" alt="" style={{ ...layer, zIndex: 5 }} />

      <div style={{ position: 'absolute', left: '50%', top: '17.8%', transform: 'translate(-50%,-50%)', zIndex: 7, color: '#111', fontFamily: 'var(--font-jbmono),monospace', fontWeight: 500, fontSize: W * 0.023, letterSpacing: '0.48em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        YOUTHCARDS
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '23.8%', transform: 'translate(-50%,-50%)', zIndex: 7, color: '#050505', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 900, fontSize: W * 0.078, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {(d.name || 'PLAYER NAME')}
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '29.1%', transform: 'translate(-50%,-50%)', zIndex: 7, color: '#111', fontFamily: 'var(--font-jbmono),monospace', fontWeight: 700, fontSize: W * 0.03, letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {(d.position || 'POSITION') + ' ✦ #' + (d.number || '23')}
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '37.8%', transform: 'translate(-50%,-50%)', zIndex: 7, color: '#050505', fontFamily: 'var(--font-jbmono),monospace', fontWeight: 800, fontSize: W * 0.034, letterSpacing: '0.24em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        PLAYER STORY
      </div>

      <div style={{ position: 'absolute', left: '25%', right: '25%', top: '43.3%', zIndex: 7, color: '#222', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 500, fontSize: W * 0.027, lineHeight: 1.45, textAlign: 'center', pointerEvents: 'none', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {backText || 'Tap the card to connect with the athlete profile, highlights, stats, and updates.'}
      </div>

      {statKeys.map(([key, value], i) => {
        const xs = ['30%', '50%', '70%'];
        return (
          <div key={key} style={{ position: 'absolute', left: xs[i], top: '58.3%', transform: 'translate(-50%,-50%)', zIndex: 7, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ color: '#111', fontFamily: 'var(--font-jbmono),monospace', fontWeight: 600, fontSize: W * 0.027, letterSpacing: '0.11em', textTransform: 'uppercase', lineHeight: 1 }}>{key.toUpperCase()}</div>
            <div style={{ color: '#050505', fontFamily: 'var(--font-oswald),system-ui', fontWeight: 900, fontSize: W * 0.059, lineHeight: 1.15 }}>{value || '-'}</div>
          </div>
        );
      })}

      {physicalRows.map((row, i) => {
        if (!row.value) return null;
        const tops = ['64.4%', '67.7%', '71.0%', '74.3%', '77.6%', '80.9%'];
        return (
          <div key={row.label} style={{ position: 'absolute', left: '62%', top: tops[i], transform: 'translateY(-50%)', zIndex: 7, color: '#111', fontFamily: 'var(--font-manrope),system-ui', fontWeight: 500, fontSize: W * 0.025, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'left', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            {row.value}
          </div>
        );
      })}
    </div>
  );
}

function RealChromeBack({
  template,
  details,
  logo,
  backText,
  size = 240,
  selected,
  dim,
  style,
}: {
  template: CardTemplate;
  details: Details | null;
  logo?: string | null;
  backText?: string;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const H = Math.round(size * 1.415);
  const d = details || ({} as Partial<Details>);
  // Extract "gold" from "chrome-legacy-gold"
  const variantName = template.id.replace('chrome-legacy-', '');

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.05,
        position: 'relative',
        overflow: 'hidden',
        background: '#090909',
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.35)`
          : '0 10px 32px rgba(0,0,0,.28)',
        flexShrink: 0,
        transition: 'opacity .25s ease',
        opacity: dim ? 0.5 : 1,
        ...style,
      }}
    >
      {/* Coloured chrome back base — variant-specific */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/templates/chrome-legacy/back/variants/back-base-${variantName}.png`} alt="" style={{ ...layer, zIndex: 1 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/chrome-legacy/back/chrome-legacy-back-nameplate.png"    alt="" style={{ ...layer, zIndex: 3 }} />
      {[1, 2, 3, 4, 5].map((n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={n} src={`/templates/chrome-legacy/back/chrome-legacy-back-dna-row-${n}.png`} alt="" style={{ ...layer, zIndex: 4 + n }} />
      ))}
      <img src="/templates/chrome-legacy/back/chrome-legacy-back-nfc-panel.png"    alt="" style={{ ...layer, zIndex: 11 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/chrome-legacy/back/chrome-legacy-back-nfc-content.png"  alt="" style={{ ...layer, zIndex: 12 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/chrome-legacy/back/chrome-legacy-back-footer.png"       alt="" style={{ ...layer, zIndex: 13 }} />

      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          style={{
            position: 'absolute',
            left: '50%',
            top: '10.4%',
            width: W * 0.22,
            height: W * 0.22,
            transform: 'translate(-50%, -50%)',
            objectFit: 'contain',
            zIndex: 20,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 3px 7px rgba(0,0,0,.75))',
          }}
        />
      )}

      {/* Player name — CLB_ZONES.name.cy = 0.240, metallic chrome style */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '24%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          color: '#D8D8DC',
          textShadow: '0 1px 6px rgba(0,0,0,.9)',
          fontFamily: 'var(--font-oswald), system-ui',
          fontWeight: 900,
          fontStyle: 'italic',
          fontSize: W * 0.086,
          lineHeight: 1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {d.name || 'PLAYER NAME'}
      </div>

      {/* Story text — CLB_ZONES.storyBody.top = 0.302 */}
      {backText && (
        <div
          style={{
            position: 'absolute',
            left: '12%',
            right: '12%',
            top: '30.2%',
            zIndex: 20,
            color: 'rgba(215,215,220,.88)',
            fontFamily: 'var(--font-manrope), system-ui',
            fontWeight: 500,
            fontSize: W * 0.029,
            lineHeight: 1.48,
            textAlign: 'center',
            pointerEvents: 'none',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {backText}
        </div>
      )}

      {/* Footer — CLB_ZONES.footer.cy = 0.966, accent colour */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '96.6%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          color: template.accent,
          fontFamily: 'var(--font-oswald), system-ui',
          fontWeight: 600,
          fontSize: W * 0.03,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        ★ {(d.name || 'EMBLEM').toUpperCase().slice(0, 14)} ★
      </div>
    </div>
  );
}

// ── EMJFL front — real frame asset + CSS text overlays ──────────────────────
// `background.png` is the actual East Manchester JFL card frame (orange/red
// metallic border + dark navy diagonal nameplate panel, already baked in as
// a flat opaque image). The player photo is clipped to the "photo well" —
// the polygon below was measured pixel-by-pixel from that asset so the photo
// sits exactly inside the diagonal cutout instead of covering the panel.

const EMJFL_PHOTO_CLIP =
  'polygon(39% 4%, 96% 4%, 96% 96%, 8% 96%, 4% 90%, 25% 77%, 25% 28%)';

function EmjflCardArt({
  photo,
  details,
  logo,
  size = 240,
  selected,
  dim,
  style,
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
}: {
  photo: string | null;
  details: Details | null;
  logo?: string | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
}) {
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        background: '#0b1220',
        boxShadow: selected
          ? '0 0 0 2.5px #FF4B1F, 0 18px 40px rgba(0,0,0,.32)'
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Real EMJFL frame + navy nameplate panel asset — fully opaque, sits underneath the photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/templates/emjfl/background.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 1, pointerEvents: 'none' }} />

        {/* Photo — clipped to the photo-well cut into the real frame asset, drawn on top */}
        {photo ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, clipPath: EMJFL_PHOTO_CLIP }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center 12%',
                transform: `translate(${photoOffsetX}%, ${photoOffsetY}%) scale(${photoScale})`,
              }}
            />
          </div>
        ) : null}

        {/* League badge — real EMJFL crest asset. Center/diameter measured
            directly from the reference layer: center 16.86% / 12.88%, true
            circular diameter 19.62% of W. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/templates/emjfl/league-badge.png"
          alt=""
          style={{
            position: 'absolute', left: '16.86%', top: '12.88%', width: W * 0.1962, height: W * 0.1962,
            transform: 'translate(-50%, -50%)', zIndex: 5, pointerEvents: 'none',
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))',
          }}
        />

        {/* Club badge */}
        {logo && (
          <div
            style={{
              // Center/diameter measured directly from the reference club-badge
              // layer (Curzon Ashton Juniors): center at 16.0% / 27.0%, true
              // circular diameter 17.14% of W. Badge art already has its own
              // ring border baked in, so no extra white backing plate here.
              position: 'absolute', left: '16%', top: '27%', width: W * 0.1714, height: W * 0.1714,
              transform: 'translate(-50%, -50%)', zIndex: 5,
              borderRadius: '50%', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,.55))',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
          </div>
        )}

        {/* Player name — vertical, reads bottom-to-top. Position/size measured
            pixel-for-pixel from the reference name.png layer (bbox 10.1–15.8%
            x, 37.0–66.8% y on the 1050×1498 canonical canvas). */}
        <div
          style={{
            position: 'absolute', left: '10.1%', top: '66.8%', width: H * 0.298, zIndex: 5,
            transform: 'rotate(-90deg)', transformOrigin: 'left top',
            color: '#fff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800,
            fontSize: W * 0.057, lineHeight: 1, letterSpacing: '0.01em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {d.name || 'Player Name'}
        </div>

        {/* Position — vertical, small red accent, runs alongside the name
            (not below it) per the reference poition.png layer. The word
            "MIDFIELDER" itself only occupies y 48.9–58.7%; a separate red
            accent tick trails below it from y 59.8–67.3%, lining its bottom
            edge up with the name's baseline — reproduced as its own bar. */}
        <div
          style={{
            position: 'absolute', left: '18.3%', top: '58.9%', width: H * 0.13, zIndex: 5,
            transform: 'rotate(-90deg)', transformOrigin: 'left top',
            color: '#FF4B1F', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700,
            fontSize: W * 0.028, lineHeight: 1, letterSpacing: '0.1em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          {d.position || 'Position'}
        </div>

        {/* Accent tick trailing below the position label */}
        <div
          style={{
            position: 'absolute', left: '18.6%', top: '59.8%', width: Math.max(2, W * 0.005),
            height: H * 0.0748, zIndex: 5, pointerEvents: 'none', borderRadius: 2,
            background: 'linear-gradient(180deg, #FF4B1F 0%, rgba(255,75,31,0.1) 100%)',
          }}
        />

        {/* Jersey number — position/size measured from the reference kit
            number.png layer (bbox 8.8–20.0% x, 69.3–77.8% y, on the 1050×1498
            canonical canvas → left 8.8%, top 69.3%, cap-height ~12.2% of W). */}
        <div
          style={{
            position: 'absolute', left: '8.8%', top: '69.3%', zIndex: 5,
            color: 'transparent', WebkitTextStroke: `${Math.max(1, W * 0.006)}px #fff`,
            fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800, fontStyle: 'italic',
            fontSize: W * 0.122, lineHeight: 1, pointerEvents: 'none',
          }}
        >
          {d.number || '10'}
        </div>

        {/* Bottom-right corner ribbon — real asset, transparent everywhere except the corner shape */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/templates/emjfl/corner-ribbon.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 7, pointerEvents: 'none' }} />

        {/* EMJFL wordmark — position/size measured from the reference "port
            eague.png" (EMJFL wordmark) layer: centered at x=87.14%,
            top=84.91%, cap-height ≈4.76% of W. */}
        <div style={{ position: 'absolute', left: '87.14%', top: '84.91%', transform: 'translateX(-50%)', zIndex: 8, textAlign: 'center', pointerEvents: 'none', color: '#fff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800, fontSize: W * 0.0476, lineHeight: 1, letterSpacing: '0.02em' }}>
          EMJFL
        </div>

        {/* "Official Player Card" caption — position/size measured from the
            reference "offica payer card.png" layer: both lines centered at
            x=86.9%, line 1 top=89.65%, cap-height ≈2.86% of W, ~0.6% gap. */}
        <div style={{ position: 'absolute', left: '86.9%', top: '89.65%', transform: 'translateX(-50%)', zIndex: 8, textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ color: '#fff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700, fontSize: W * 0.0286, lineHeight: 1, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Official</div>
          <div style={{ color: '#fff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700, fontSize: W * 0.0286, lineHeight: 1, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: W * 0.004 }}>Player Card</div>
        </div>
      </div>
    </div>
  );
}

// ── EMJFL back — dark navy summary card ─────────────────────────────────────

// The reference back design is fully static — "OFFICIAL PLAYER CARD" header,
// "PLAYER IDENTITY" title, NFC tap-to-access list, "Powered by Emblem"
// footer. No per-player text at all, so it renders as a single real asset.
function HollinwoodCardArt({
  template,
  photo,
  details,
  size = 240,
  selected,
  dim,
  style,
  logo,
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  logo?: string | null;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
}) {
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);
  const variant = getHollinwoodVariant(template.id);
  const { assets } = variant;

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        background: template.accent,
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.32)`
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.frontBase} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 1, pointerEvents: 'none' }} />

        {photo ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, clipPath: EMJFL_PHOTO_CLIP }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center 12%',
                transform: `translate(${photoOffsetX}%, ${photoOffsetY}%) scale(${photoScale})`,
              }}
            />
          </div>
        ) : null}

        {/* Supplied Hollinwood layers are full-canvas transparent PNGs, already positioned to the 1050x1498 artboard. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.leagueBadge} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 5, pointerEvents: 'none' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo || assets.clubBadge}
          alt=""
          style={{
            position: 'absolute',
            left: logo ? '16%' : 0,
            top: logo ? '27%' : 0,
            width: logo ? '17.14%' : '100%',
            height: logo ? 'auto' : '100%',
            objectFit: logo ? 'contain' : 'fill',
            transform: logo ? 'translate(-50%, -50%)' : undefined,
            zIndex: 5,
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'absolute', left: '10.1%', top: '66.8%', width: H * 0.298, zIndex: 6,
            transform: 'rotate(-90deg)', transformOrigin: 'left top',
            color: '#fff', fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800,
            fontSize: W * 0.057, lineHeight: 1, letterSpacing: '0.01em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {d.name || 'Player Name'}
        </div>

        <div
          style={{
            position: 'absolute', left: '18.3%', top: '58.9%', width: H * 0.13, zIndex: 6,
            transform: 'rotate(-90deg)', transformOrigin: 'left top',
            color: template.accent, fontFamily: 'var(--font-oswald), system-ui', fontWeight: 700,
            fontSize: W * 0.028, lineHeight: 1, letterSpacing: '0.1em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}
        >
          {d.position || 'Position'}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.positionTick} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 5, pointerEvents: 'none' }} />

        <div
          style={{
            position: 'absolute', left: '8.8%', top: '69.3%', zIndex: 6,
            color: 'transparent', WebkitTextStroke: `${Math.max(1, W * 0.006)}px #fff`,
            fontFamily: 'var(--font-oswald), system-ui', fontWeight: 800, fontStyle: 'italic',
            fontSize: W * 0.122, lineHeight: 1, pointerEvents: 'none',
          }}
        >
          {d.number || '10'}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.cornerRibbon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 7, pointerEvents: 'none' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.emblemMark} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 8, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

function CustomCollectionCardArt({
  template,
  photo,
  details,
  size = 240,
  selected,
  dim,
  style,
  logo,
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  logo?: string | null;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
}) {
  const W = size;
  const d = details || ({} as Partial<Details>);
  const variant = getCustomCollectionVariant(template.id);
  const H = Math.round(size * 1.4);
  const { assets } = variant;
  const isComic = variant.id === 'custom-comic';
  const nameWidth = variant.nameBox?.width
    ? H * (Number(variant.nameBox.width.replace('%', '')) / 100)
    : H * 0.298;
  const positionWidth = variant.positionBox?.width
    ? H * (Number(variant.positionBox.width.replace('%', '')) / 100)
    : H * 0.13;
  const customLayerFit: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    objectPosition: 'center center',
    pointerEvents: 'none',
  };

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        background: variant.background,
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.32)`
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ...style,
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {assets.base ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.base} alt="" style={{ ...customLayerFit, zIndex: 0 }} />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assets.background} alt="" style={{ ...customLayerFit, zIndex: 1 }} />

        {photo ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, clipPath: EMJFL_PHOTO_CLIP }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center 12%',
                transform: `translate(${photoOffsetX}%, ${photoOffsetY}%) scale(${photoScale})`,
              }}
            />
          </div>
        ) : null}

        {assets.frameOverlay ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.frameOverlay} alt="" style={{ ...customLayerFit, zIndex: 4 }} />
        ) : null}
        {assets.railOverlay ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.railOverlay} alt="" style={{ ...customLayerFit, zIndex: 5 }} />
        ) : null}
        {assets.emblemBurst ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.emblemBurst} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 6, pointerEvents: 'none' }} />
        ) : null}

        {logo ? (
          <div style={{ position: 'absolute', left: variant.badgeBox?.left || (isComic ? '15.5%' : '16%'), top: variant.badgeBox?.top || (isComic ? '14.5%' : '15%'), width: variant.badgeBox?.width || (isComic ? '16%' : '17.14%'), height: variant.badgeBox?.height || (isComic ? '11.5%' : '12%'), zIndex: 7, pointerEvents: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : null}

        {assets.emblemLogoPosition ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.emblemLogoPosition} alt="" style={{ ...customLayerFit, zIndex: 8 }} />
        ) : null}

        <div
          style={{
            position: 'absolute',
            left: variant.nameBox?.left || (isComic ? '10.6%' : '10.1%'),
            top: variant.nameBox?.top || (isComic ? '66.8%' : '66.8%'),
            width: nameWidth,
            zIndex: 8,
            transform: variant.nameBox?.rotate ? `translate(-50%, -50%) rotate(${variant.nameBox.rotate})` : 'rotate(-90deg)',
            transformOrigin: variant.nameBox?.rotate ? 'center center' : 'left top',
            color: '#fff',
            fontFamily: variant.nameBox?.fontFamily || 'var(--font-oswald), system-ui',
            fontWeight: variant.nameBox?.fontWeight || 800,
            fontSize: W * (variant.nameBox?.fontSize ? Number(variant.nameBox.fontSize) : isComic ? 0.064 : 0.057), lineHeight: 1, letterSpacing: '0.01em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: '0 2px 4px rgba(0,0,0,.45)',
            pointerEvents: 'none',
          }}
        >
          {d.name || 'Player Name'}
        </div>

        <div
          style={{
            position: 'absolute',
            left: variant.positionBox?.left || (isComic ? '20.2%' : '18.3%'),
            top: variant.positionBox?.top || '58.9%',
            width: positionWidth,
            zIndex: 8,
            transform: variant.positionBox?.rotate
              ? `translate(-50%, -50%) rotate(${variant.positionBox.rotate})`
              : 'rotate(-90deg)',
            transformOrigin: variant.positionBox?.rotate ? 'center center' : 'left top',
            color: variant.positionBox?.color || template.accent,
            fontFamily: variant.positionBox?.fontFamily || 'var(--font-oswald), system-ui',
            fontWeight: variant.positionBox?.fontWeight || 800,
            fontSize: W * (variant.positionBox?.fontSize ? Number(variant.positionBox.fontSize) : 0.028),
            lineHeight: 1,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,.45)', pointerEvents: 'none',
          }}
        >
          {d.position || 'Position'}
        </div>

        {assets.numberBurst ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.numberBurst} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 7, pointerEvents: 'none' }} />
        ) : null}

        <div
          style={{
            position: 'absolute', left: variant.numberBox?.left || (isComic ? '11.1%' : '8.8%'), top: variant.numberBox?.top || (isComic ? '84.5%' : '69.3%'), zIndex: 8,
            color: variant.numberBox?.color || (isComic ? '#fff' : 'transparent'),
            WebkitTextStroke: variant.numberBox?.stroke
              ? `${Math.max(1, W * 0.004)}px ${variant.numberBox.stroke}`
              : isComic ? `${Math.max(1, W * 0.004)}px #111` : `${Math.max(1, W * 0.006)}px #fff`,
            fontFamily: variant.numberBox?.fontFamily || 'var(--font-oswald), system-ui',
            fontWeight: variant.numberBox?.fontWeight || 900,
            fontStyle: variant.numberBox?.fontStyle || 'italic',
            fontSize: W * (variant.numberBox?.fontSize ? Number(variant.numberBox.fontSize) : isComic ? 0.145 : 0.122), lineHeight: 1, pointerEvents: 'none',
            transform: variant.numberBox?.rotate
              ? `translate(-50%, -50%) rotate(${variant.numberBox.rotate})`
              : isComic ? 'translate(-50%, -50%) rotate(-8deg)' : undefined,
            textShadow: variant.numberBox?.shadow || (isComic ? '0 3px 0 #111' : undefined),
          }}
        >
          {d.number || '10'}
        </div>

        {assets.cornerOverlay ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assets.cornerOverlay} alt="" style={{ ...customLayerFit, zIndex: 9 }} />
        ) : null}
        {isComic && !assets.cornerOverlay ? (
          <div style={{ position: 'absolute', left: '82%', top: '88.5%', zIndex: 10, transform: 'translate(-50%, -50%) rotate(-3deg)', color: '#fff', fontFamily: 'var(--font-oswald), system-ui', textAlign: 'center', textTransform: 'uppercase', lineHeight: 0.9, WebkitTextStroke: `${Math.max(1, W * 0.004)}px #111`, textShadow: '0 2px 0 #111', pointerEvents: 'none' }}>
            <strong style={{ display: 'block', fontSize: W * 0.06 }}>Emblem</strong>
            <span style={{ display: 'block', fontSize: W * 0.035, color: template.accent }}>Custom</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmjflCardBack({
  size = 240,
  selected,
  dim,
  style,
}: {
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const H = Math.round(size * 1.4);

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: selected
          ? '0 0 0 2.5px #FF4B1F, 0 18px 40px rgba(0,0,0,.32)'
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'opacity .25s ease',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/emjfl/back-background.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 1 }} />
      {/* League badge + EMJFL wordmark — pre-positioned on the same 1050×1498
          canvas as the background, nudged up slightly (-1.8% of H) so the
          wordmark's drop shadow clears "OFFICIAL PLAYER CARD" below it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/emjfl/back-league-badge.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 2, transform: 'translateY(-1.8%)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/emjfl/back-emjfl-wordmark.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 2, transform: 'translateY(-1.8%)' }} />
      {/* "Official EMJFL Collection" caption already fits cleanly in the gap
          between the star divider and "Player Identity" — no adjustment. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/emjfl/back-collection-caption.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 2 }} />
    </div>
  );
}

function HollinwoodCardBack({
  template,
  size = 240,
  selected,
  dim,
  style,
}: {
  template: CardTemplate;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const H = Math.round(size * 1.4);
  const backPath = getHollinwoodVariant(template.id).assets.backBase;

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.32)`
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'opacity .25s ease',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backPath} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', zIndex: 1 }} />
    </div>
  );
}

function CustomCollectionCardBack({
  template,
  details,
  logo,
  size = 240,
  selected,
  dim,
  style,
}: {
  template: CardTemplate;
  details: Details | null;
  logo?: string | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const W = size;
  const d = details || ({} as Partial<Details>);
  const variant = getCustomCollectionVariant(template.id);
  const H = Math.round(size * 1.4);
  const back = variant.back;
  const backPath = back?.base || variant.assets.backBase || variant.assets.preview;
  const logoBox = back?.logoBox;
  const nameBox = back?.nameBox;

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.045,
        position: 'relative',
        flexShrink: 0,
        overflow: 'hidden',
        background: variant.background,
        boxShadow: selected
          ? `0 0 0 2.5px ${template.accent}, 0 18px 40px rgba(0,0,0,.32)`
          : '0 10px 30px rgba(0,0,0,.22)',
        opacity: dim ? 0.5 : 1,
        transition: 'opacity .25s ease',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backPath} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', objectPosition: 'center center', zIndex: 1 }} />
      {logoBox && logo ? (
        <div
          style={{
            position: 'absolute',
            left: logoBox.left,
            top: logoBox.top,
            width: logoBox.width,
            height: logoBox.height,
            zIndex: 2,
            display: 'grid',
            placeItems: 'center',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
      ) : null}
      {nameBox ? (
        <div
          style={{
            position: 'absolute',
            left: nameBox.left,
            top: nameBox.top,
            width: nameBox.width,
            zIndex: 3,
            transform: 'translate(-50%, -50%)',
            color: nameBox.color || '#fff',
            fontFamily: nameBox.fontFamily || 'var(--font-barlow-condensed), "Arial Narrow", sans-serif',
            fontWeight: 900,
            fontSize: W * (nameBox.fontSize ? Number(nameBox.fontSize) : 0.098),
            lineHeight: 0.9,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 2px 8px rgba(0,0,0,.45)',
            pointerEvents: 'none',
          }}
        >
          {d.name || 'Player Name'}
        </div>
      ) : null}
    </div>
  );
}

export { RealCardBack, RealGalaxyBack, RealChromeBack };

// ── Main export — routes to real or procedural renderer ──────────────────────

export default function CardArt({
  template,
  photo,
  details,
  size = 240,
  selected,
  dim,
  style,
  side = 'front',
  logo,
  stats,
  sport = 'basketball',
  backText,
  physical,
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  side?: 'front' | 'back';
  logo?: string | null;
  stats?: Record<string, string>;
  sport?: SportId;
  backText?: string;
  physical?: Record<string, string>;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
}) {
  // Back of card
  if (side === 'back' && template.family === 'Futuristic') {
    return <RealCardBack details={details} logo={logo} stats={stats} backText={backText} physical={physical} accent={template.accent} size={size} selected={selected} dim={dim} style={style} />;
  }
  if (side === 'back' && template.family === 'Galaxy') {
    return <RealGalaxyBack details={details} logo={logo} stats={stats} backText={backText} physical={physical} size={size} selected={selected} dim={dim} style={style} />;
  }
  if (side === 'back' && template.family === 'Chrome') {
    return <RealChromeBack template={template} details={details} logo={logo} backText={backText} size={size} selected={selected} dim={dim} style={style} />;
  }
  if (side === 'back' && template.family === 'Champions') {
    const W = size; const H = Math.round(size * 1.4);
    return (
      <div style={{ width: W, height: H, borderRadius: W * 0.07, position: 'relative', overflow: 'hidden', flexShrink: 0, boxShadow: selected ? '0 0 0 2.5px var(--accent), 0 18px 40px rgba(0,0,0,.22)' : '0 10px 30px rgba(0,0,0,.16)', opacity: dim ? 0.5 : 1, ...style }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/templates/champions/back.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  if (side === 'back' && template.family === 'EMJFL') {
    return <EmjflCardBack size={size} selected={selected} dim={dim} style={style} />;
  }
  if (side === 'back' && template.family === 'Hollinwood') {
    return <HollinwoodCardBack template={template} size={size} selected={selected} dim={dim} style={style} />;
  }
  if (side === 'back' && template.family === 'Custom') {
    return <CustomCollectionCardBack template={template} details={details} logo={logo} size={size} selected={selected} dim={dim} style={style} />;
  }
  if (template.family === 'EMJFL') {
    return <EmjflCardArt photo={photo} details={details} logo={logo} size={size} selected={selected} dim={dim} style={style} photoScale={photoScale} photoOffsetX={photoOffsetX} photoOffsetY={photoOffsetY} />;
  }
  if (template.family === 'Hollinwood') {
    return <HollinwoodCardArt template={template} photo={photo} details={details} logo={logo} size={size} selected={selected} dim={dim} style={style} photoScale={photoScale} photoOffsetX={photoOffsetX} photoOffsetY={photoOffsetY} />;
  }
  if (template.family === 'Custom') {
    return <CustomCollectionCardArt template={template} photo={photo} details={details} logo={logo} size={size} selected={selected} dim={dim} style={style} photoScale={photoScale} photoOffsetX={photoOffsetX} photoOffsetY={photoOffsetY} />;
  }

  // Route to real PNG renderer for Futuristic / Chrome / Galaxy templates
  if (template.bgPath) {
    return <RealCardArt template={template} photo={photo} details={details} size={size} selected={selected} dim={dim} style={style} logo={logo} stats={stats} sport={sport} photoScale={photoScale} photoOffsetX={photoOffsetX} photoOffsetY={photoOffsetY} />;
  }

  const s = familyStyle(template.family, template.accent);
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);
  const photoMask = 'radial-gradient(125% 105% at 50% 36%, #000 58%, transparent 82%)';

  return (
    <div
      style={{
        width: W,
        height: H,
        borderRadius: W * 0.07,
        position: 'relative',
        overflow: 'hidden',
        background: s.bg,
        boxShadow: selected
          ? '0 0 0 2.5px var(--accent), 0 18px 40px rgba(0,0,0,.22)'
          : '0 10px 30px rgba(0,0,0,.16)',
        flexShrink: 0,
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        opacity: dim ? 0.5 : 1,
        fontFamily: 'var(--font-sora), system-ui',
        ...style,
      }}
    >
      {/* inner frame line */}
      <div
        style={{
          position: 'absolute',
          inset: W * 0.035,
          borderRadius: W * 0.05,
          boxShadow: `inset 0 0 0 1px ${s.frame}`,
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />
      {/* carbon weave */}
      {s.carbon && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,.04) 0 2px, transparent 2px 4px)',
            opacity: 0.5,
          }}
        />
      )}
      {/* photo cut-out */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '6%',
          transform: 'translateX(-50%)',
          width: '92%',
          height: '78%',
          WebkitMaskImage: photoMask,
          maskImage: photoMask,
          zIndex: 2,
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
              filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.3))',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: s.sub,
            }}
          >
            <svg
              width={W * 0.42}
              height={W * 0.42}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.3}
            >
              <circle cx="12" cy="8.5" r="4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
      {/* foil */}
      {s.foil && (
        <div
          className="foil"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            mixBlendMode: 'color-dodge',
            opacity: 0.35,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* top chrome */}
      <div
        style={{
          position: 'absolute',
          top: W * 0.075,
          left: W * 0.085,
          right: W * 0.085,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 5,
          color: s.ink,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sora), system-ui',
            fontWeight: 700,
            fontSize: W * 0.058,
            letterSpacing: '0.01em',
          }}
        >
          EMBLEM
        </span>
        <span style={{ color: s.ink, opacity: 0.85 }}>
          <Icon name="nfc" size={W * 0.075} />
        </span>
      </div>
      {/* nameplate */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: `${W * 0.18}px ${W * 0.085}px ${W * 0.085}px`,
          zIndex: 5,
          background: s.light
            ? 'linear-gradient(transparent, rgba(255,255,255,.85) 45%)'
            : 'linear-gradient(transparent, rgba(0,0,0,.6) 45%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: s.sub,
                fontSize: W * 0.05,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-jbmono), monospace',
                marginBottom: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(d.team || 'Team') + ' · ' + (d.position || 'POS')}
            </div>
            <div
              style={{
                color: s.ink,
                fontSize: W * 0.105,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'var(--font-sora), system-ui',
              }}
            >
              {d.name || 'Your Name'}
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              minWidth: W * 0.16,
              height: W * 0.16,
              borderRadius: W * 0.04,
              background: template.accent,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-sora), system-ui',
              fontWeight: 800,
              fontSize: W * 0.1,
              padding: `0 ${W * 0.02}px`,
              boxShadow: '0 4px 12px rgba(0,0,0,.25)',
            }}
          >
            {d.number || '00'}
          </div>
        </div>
      </div>
    </div>
  );
}
