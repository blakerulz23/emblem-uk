import type { CSSProperties } from 'react';
import { computePhotoGeometry } from '@/lib/photo-geometry';
import { nameFitScale } from '@/lib/nameplate-typography';
import { positionCardLabel } from '@/lib/player-position';
import type { CardTemplate, Details } from './data';

/**
 * Glacier Edition (Custom Collection) — the same horizontal, centred
 * name/position/number layout as Crimson/Royal/Emerald (see
 * CrimsonCardArt.tsx's own doc comment for the full reasoning), themed
 * ice-blue/silver. Measured directly from the supplied reference layers
 * (alpha bounds on the shared 1050x1498 native canvas):
 *
 *   number ("6" reference, 25.png):   centre-x 18.24%, bottom-anchor 26.23%
 *   name ("JOSH THOMPSON", 26.png):   centre-x ~50%, bottom-anchor 69.43%
 *   position ("MIDFIELDER", 27.png):  centre-x ~50%, bottom-anchor 74.03%
 *
 * Typography treatment — genuinely different from every prior variant in
 * this family, confirmed by direct pixel sampling, not assumed: a single
 * solid fill (#c0e8ff) with a soft drop shadow (pure black ~40% opacity,
 * offset down-right with a soft blurred edge — sampled directly from the
 * reference PNGs' own alpha channel). This is a plain CSS text-shadow, not
 * an outline: unlike the layered fill+outline technique EmeraldCardArt
 * uses (which exists specifically to avoid a stroke closing narrow
 * letterforms/digit counters), a text-shadow paints a soft offset copy
 * behind the glyph without touching its own fill path, so there's no
 * counter-closing risk here at all.
 *
 * Photo window shape — also genuinely different: an open-bottomed arch
 * (semicircular top, straight vertical sides, no visible closing curve
 * within base.png — confirmed via a percent-gridded measurement), not the
 * closed ellipse Crimson/Royal/Emerald use. CSS clip-path's basic shapes
 * have no native stadium/arch function, so the clip is built as an
 * explicit SVG path from the card's own real pixel W/H at render time
 * (below, buildArchClipPath) — an elliptical arc for the top, straight
 * lines down the sides, and a flat closing bottom edge (its exact shape
 * doesn't matter: frameOverlay covers that region regardless, same as
 * every other variant in this family).
 *
 * Font: Barlow Condensed Bold — same evidence-based match as the rest of
 * this template family (same underlying letterforms), already loaded.
 */

const FILL_COLOR = '#c0e8ff';
const TEXT_SHADOW = '0.05em 0.06em 0.04em rgba(0,0,0,0.4)';
const FONT_FAMILY = 'var(--font-barlow-condensed), "Arial Narrow", sans-serif';

const NUMBER_GEOMETRY = { left: '18.24%', bottom: '26.23%', fontSizeFactor: 0.21, comfortableChars: 2, minScale: 0.8 };
const NAME_GEOMETRY = { left: '50%', bottom: '69.43%', fontSizeFactor: 0.105, comfortableChars: 14, minScale: 0.6 };
const POSITION_GEOMETRY = { left: '50%', bottom: '74.03%', fontSizeFactor: 0.045, comfortableChars: 11, minScale: 0.85 };

/**
 * Builds the arch (stadium-top) clip-path SVG path in the element's own
 * pixel coordinate space — clip-path's `path()` only accepts absolute
 * lengths, not percentages, so this must be recomputed from the card's
 * real W/H rather than expressed as a fixed percentage string.
 */
function buildArchClipPath(W: number, H: number): string {
  const rx = W * 0.4;
  const springlineY = H * 0.45;
  const ry = H * 0.18;
  const bottomY = H * 0.62;
  const leftX = W * 0.5 - rx;
  const rightX = W * 0.5 + rx;
  return `path('M ${leftX} ${springlineY} A ${rx} ${ry} 0 0 1 ${rightX} ${springlineY} L ${rightX} ${bottomY} L ${leftX} ${bottomY} Z')`;
}

type PhotoNaturalSizeProp = { photoNaturalWidth?: number; photoNaturalHeight?: number };

function toSizingArg(natural: PhotoNaturalSizeProp, boxWidth: number, boxHeight: number) {
  const { photoNaturalWidth, photoNaturalHeight } = natural;
  if (!photoNaturalWidth || !photoNaturalHeight) return null;
  return { naturalWidth: photoNaturalWidth, naturalHeight: photoNaturalHeight, boxWidth, boxHeight };
}

export default function GlacierCardArt({
  photo,
  details,
  size = 240,
  selected,
  dim,
  style,
  photoScale = 1,
  photoOffsetX = 0,
  photoOffsetY = 0,
  photoNaturalWidth,
  photoNaturalHeight,
}: {
  template: CardTemplate;
  photo: string | null;
  details: Details | null;
  size?: number;
  selected?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  photoScale?: number;
  photoOffsetX?: number;
  photoOffsetY?: number;
} & PhotoNaturalSizeProp) {
  const W = size;
  const H = Math.round(size * 1.4);
  const d = details || ({} as Partial<Details>);
  const root = '/templates/custom-collection/glacier';
  const layerFit: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' };

  const playerName = d.name || 'Player Name';
  const positionLabel = positionCardLabel(d.position, 'POSITION');
  const number = d.number || '10';

  const textBase: CSSProperties = {
    position: 'absolute',
    fontFamily: FONT_FAMILY,
    fontWeight: 800,
    color: FILL_COLOR,
    textShadow: TEXT_SHADOW,
    lineHeight: 1,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    pointerEvents: 'none',
  };

  return (
    <div
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        borderRadius: W * 0.045,
        background: '#04101f',
        opacity: dim ? 0.5 : 1,
        boxShadow: selected ? `0 0 0 2.5px #4fc3f7, 0 18px 40px rgba(0,0,0,.32)` : '0 10px 30px rgba(0,0,0,.22)',
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/base.png`} alt="" style={{ ...layerFit, zIndex: 0 }} />

      {photo ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, clipPath: buildArchClipPath(W, H) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt=""
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              ...computePhotoGeometry(
                { x: photoOffsetX, y: photoOffsetY, scale: photoScale },
                'center 25%',
                toSizingArg({ photoNaturalWidth, photoNaturalHeight }, W, H)
              ),
            }}
          />
        </div>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/frame-overlay.png`} alt="" style={{ ...layerFit, zIndex: 2 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/emblem-logo-position.png`} alt="" style={{ ...layerFit, zIndex: 3 }} />

      <div
        style={{
          ...textBase,
          left: NUMBER_GEOMETRY.left,
          top: NUMBER_GEOMETRY.bottom,
          transform: 'translate(-50%, -100%)',
          fontSize: W * NUMBER_GEOMETRY.fontSizeFactor * nameFitScale(number, NUMBER_GEOMETRY.comfortableChars, NUMBER_GEOMETRY.minScale),
          zIndex: 4,
        }}
      >
        {number}
      </div>

      <div
        style={{
          ...textBase,
          left: NAME_GEOMETRY.left,
          top: NAME_GEOMETRY.bottom,
          width: '86%',
          transform: 'translate(-50%, -100%)',
          fontSize: W * NAME_GEOMETRY.fontSizeFactor * nameFitScale(playerName, NAME_GEOMETRY.comfortableChars, NAME_GEOMETRY.minScale),
          zIndex: 4,
        }}
      >
        {playerName}
      </div>

      <div
        style={{
          ...textBase,
          left: POSITION_GEOMETRY.left,
          top: POSITION_GEOMETRY.bottom,
          width: '80%',
          letterSpacing: '0.1em',
          transform: 'translate(-50%, -100%)',
          fontSize: W * POSITION_GEOMETRY.fontSizeFactor * nameFitScale(positionLabel, POSITION_GEOMETRY.comfortableChars, POSITION_GEOMETRY.minScale),
          zIndex: 4,
        }}
      >
        {positionLabel}
      </div>
    </div>
  );
}
