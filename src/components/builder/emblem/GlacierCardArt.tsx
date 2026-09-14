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
 * Photo window shape — corrected after a visual audit against the
 * reference (a first pass wrongly built a tight arch clip tracing the
 * ring's own inner edge — see CrimsonCardArt.tsx's own doc comment for
 * the same mistake and correction on the ellipse-clip variants). Cropping
 * and zooming into the supplied reference (21.png) shows the exact same
 * FUT-style overlap as Crimson/Royal/Emerald: the player's hair clearly
 * extends above and in front of the arch's own top curve (springline
 * ~27% of H), into the plain background above it — the arch is only
 * fully visible around the sides/below the player, not a window the
 * photo is confined inside.
 *
 * Confirmed via the supplied example-player cutout (28.png, alpha bounds
 * on the shared native canvas): top 12.48%, bottom 62.55%, left 19.05%,
 * right 81.81% — matching Crimson/Royal/Emerald's own measurement
 * closely despite Glacier's different arch shape, so the same generous
 * rectangular PHOTO_CLIP applies here too; the arch-tracing SVG-path
 * clip (buildArchClipPath) this template used in its first pass has been
 * removed entirely; base.png is fully opaque (confirmed by direct pixel
 * inspection), so there's no alpha hole to rely on either way — a real
 * customer photo's own background-removed edges (this app's mandatory
 * BackgroundRemovalStep) do the rest.
 *
 * Font: Barlow Condensed Bold — same evidence-based match as the rest of
 * this template family (same underlying letterforms), already loaded.
 *
 * Layers map: background+rearDecoration — base.png, both the backdrop and
 * the arch/ring live in this one flattened asset (z0) · player —
 * generously bounded photo (z2) · foregroundFrame — frame-overlay.png +
 * emblem-logo-position.png (z3) · textAndBranding — number/name/position
 * (z4). Player positioning applies only to the player <img>.
 */

const LAYER_Z = { background: 0, player: 2, foregroundFrame: 3, textAndBranding: 4 } as const;
// Generous inset(top right bottom left) — see CrimsonCardArt.tsx's own
// PHOTO_CLIP comment for the derivation. Replaces the arch-tracing
// buildArchClipPath SVG path this template used in its first pass.
const PHOTO_CLIP = 'inset(8% 15% 36% 15%)';
const FILL_COLOR = '#c0e8ff';
const TEXT_SHADOW = '0.05em 0.06em 0.04em rgba(0,0,0,0.4)';
const FONT_FAMILY = 'var(--font-barlow-condensed), "Arial Narrow", sans-serif';

const NUMBER_GEOMETRY = { left: '18.24%', bottom: '26.23%', fontSizeFactor: 0.21, comfortableChars: 2, minScale: 0.8 };
// bottom nudged from 69.43% to 69.90% — see CrimsonCardArt.tsx's own
// comment on this exact change for the shared root cause. Glacier's
// original value already cleared the 8px/750x1050 minimum by a couple of
// pixels, but with little margin against measurement/rendering noise;
// nudged for the same safety margin as the other three templates.
const NAME_GEOMETRY = { left: '50%', bottom: '69.90%', fontSizeFactor: 0.105, comfortableChars: 14, minScale: 0.6 };
const POSITION_GEOMETRY = { left: '50%', bottom: '74.03%', fontSizeFactor: 0.045, comfortableChars: 11, minScale: 0.85 };

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
  const layerFit: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' };

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
      {/* — background — */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/base.png`} alt="" style={{ ...layerFit, zIndex: LAYER_Z.background }} />

      {/* — player (positioning controls apply only to this layer) — */}
      {photo ? (
        <div data-capture-clip-wrapper style={{ position: 'absolute', inset: 0, zIndex: LAYER_Z.player, clipPath: PHOTO_CLIP }}>
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

      {/* — foregroundFrame — */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/frame-overlay.png`} alt="" style={{ ...layerFit, zIndex: LAYER_Z.foregroundFrame }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/emblem-logo-position.png`} alt="" style={{ ...layerFit, zIndex: LAYER_Z.foregroundFrame }} />

      <div
        style={{
          ...textBase,
          left: NUMBER_GEOMETRY.left,
          top: NUMBER_GEOMETRY.bottom,
          transform: 'translate(-50%, -100%)',
          fontSize: W * NUMBER_GEOMETRY.fontSizeFactor * nameFitScale(number, NUMBER_GEOMETRY.comfortableChars, NUMBER_GEOMETRY.minScale),
          zIndex: LAYER_Z.textAndBranding,
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
          zIndex: LAYER_Z.textAndBranding,
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
          zIndex: LAYER_Z.textAndBranding,
        }}
      >
        {positionLabel}
      </div>
    </div>
  );
}
