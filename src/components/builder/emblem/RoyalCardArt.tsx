import type { CSSProperties } from 'react';
import { computePhotoGeometry } from '@/lib/photo-geometry';
import { nameFitScale } from '@/lib/nameplate-typography';
import { positionCardLabel } from '@/lib/player-position';
import type { CardTemplate, Details } from './data';

/**
 * Royal Edition (Custom Collection) — the same horizontal, centred
 * name/position/number layout as Crimson (see CrimsonCardArt.tsx's own doc
 * comment for the full reasoning), not the shared rotated-nameplate
 * structure Solar/Galaxy/Comic use. Same underlying 1050x1498 Canva
 * template family as Crimson (near-identical photo-window geometry,
 * confirmed by direct measurement — see PHOTO_CLIP below), themed purple/
 * silver ("Royal") instead of crimson/rose-gold. Measured directly from
 * the supplied reference layers (alpha bounds on the shared native canvas):
 *
 *   number ("6" reference, 15.png):   centre-x 18.14%, bottom-anchor 26.50%
 *   name ("JOSH THOMPSON", 16.png):   centre-x ~50%, bottom-anchor 69.49%
 *   position ("MIDFIELDER", 17.png):  centre-x ~50%, bottom-anchor 74.10%
 *
 * All three reference glyphs sampled to one solid fill colour, #d9e0f0 (a
 * pale silver-lavender) — no outline/stroke layer, same as Crimson.
 *
 * Font: Barlow Condensed Bold — same evidence-based match as Crimson (same
 * template family, same letterforms), already loaded, no new font import.
 *
 * The photo window is a circle/ellipse cut into the shield artwork
 * (base.png — confirmed via direct pixel inspection to be fully opaque,
 * same as Crimson's own base.png). Measured against this template's own
 * native canvas: within ~1% of Crimson's own window bounds, so the same
 * clip is reused: centre (50%, 47.5%), radius (38% of W, 16.5% of H).
 *
 * Layer-group audit (player-occlusion review): same finding as Crimson —
 * rendered at default, extreme-zoom-in/out and extreme-pan; the clip-path
 * is a hard geometric constraint independent of the photo's own transform,
 * so the player never bleeds past the ring or reaches the outer border at
 * any setting. The ring is a closed loop, not a crossing decorative
 * element, so no rearDecoration split of base.png is needed. Layers map:
 *   background — base.png (z0) · player — clipped photo (z2)
 *   foregroundFrame — frame-overlay.png + emblem-logo-position.png (z3)
 *   textAndBranding — number/name/position (z4)
 * Player positioning applies only to the player <img>.
 */

const LAYER_Z = { background: 0, player: 2, foregroundFrame: 3, textAndBranding: 4 } as const;
const PHOTO_CLIP = 'ellipse(38% 16.5% at 50% 47.5%)';
const TEXT_COLOR = '#d9e0f0';
const FONT_FAMILY = 'var(--font-barlow-condensed), "Arial Narrow", sans-serif';

const NUMBER_GEOMETRY = { left: '18.14%', bottom: '26.50%', fontSizeFactor: 0.22, comfortableChars: 2, minScale: 0.8 };
const NAME_GEOMETRY = { left: '50%', bottom: '69.49%', fontSizeFactor: 0.111, comfortableChars: 14, minScale: 0.6 };
const POSITION_GEOMETRY = { left: '50%', bottom: '74.10%', fontSizeFactor: 0.0453, comfortableChars: 11, minScale: 0.85 };

type PhotoNaturalSizeProp = { photoNaturalWidth?: number; photoNaturalHeight?: number };

function toSizingArg(natural: PhotoNaturalSizeProp, boxWidth: number, boxHeight: number) {
  const { photoNaturalWidth, photoNaturalHeight } = natural;
  if (!photoNaturalWidth || !photoNaturalHeight) return null;
  return { naturalWidth: photoNaturalWidth, naturalHeight: photoNaturalHeight, boxWidth, boxHeight };
}

export default function RoyalCardArt({
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
  const root = '/templates/custom-collection/royal';
  const layerFit: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' };

  const playerName = d.name || 'Player Name';
  const positionLabel = positionCardLabel(d.position, 'POSITION');
  const number = d.number || '10';

  const textBase: CSSProperties = {
    position: 'absolute',
    fontFamily: FONT_FAMILY,
    fontWeight: 800,
    color: TEXT_COLOR,
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
        background: '#0a0a1f',
        opacity: dim ? 0.5 : 1,
        boxShadow: selected ? `0 0 0 2.5px #7c5cff, 0 18px 40px rgba(0,0,0,.32)` : '0 10px 30px rgba(0,0,0,.22)',
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
