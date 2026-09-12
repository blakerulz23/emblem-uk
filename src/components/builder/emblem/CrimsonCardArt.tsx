import type { CSSProperties } from 'react';
import { computePhotoGeometry } from '@/lib/photo-geometry';
import { nameFitScale } from '@/lib/nameplate-typography';
import { positionCardLabel } from '@/lib/player-position';
import type { CardTemplate, Details } from './data';

/**
 * Crimson (Custom Collection) — a horizontal, centred name/position/number
 * layout, not the shared rotated-nameplate structure every other Custom
 * Collection card (Solar/Galaxy/Comic) uses. Measured directly from the
 * supplied reference layers (alpha bounds on the shared 1050x1498 native
 * canvas every layer was supplied at):
 *
 *   number ("6" reference, 3.png):   centre-x 17.81%, bottom-anchor 25.63%
 *   name ("JOSH THOMPSON", 7.png):   centre-x 49.76% (~50%), bottom-anchor 69.23%
 *   position ("MIDFIELDER", 8.png):  centre-x 50.05% (~50%), bottom-anchor 73.83%
 *
 * All three reference glyphs sampled to one solid fill colour, #f8dcbf — no
 * outline/stroke layer (unlike the shared kit-number technique in
 * nameplate-typography.ts, which exists specifically to avoid a destructive
 * text-stroke closing a digit's counters; Crimson's own reference simply has
 * no outline to reproduce, so a single filled text node is faithful here,
 * not a shortcut).
 *
 * Font: the supplied references don't name a font. Compared against every
 * typeface already loaded in this project (globals.css's @import — Antonio,
 * Archivo, Barlow Condensed, Instrument Sans, Rajdhani; note --font-oswald
 * is a pre-existing misleading alias for a plain system-font stack, not a
 * real loaded "Oswald" — see that variable's own comment in globals.css) by
 * rendering each candidate and comparing letterforms against the reference
 * crops. Barlow Condensed Bold is the closest evidence-backed match (the
 * numeral's flat-top hooked bowl and the name's moderate condensation both
 * line up; Rajdhani's rounded terminals and Archivo's wider counters did
 * not) — and it's already used elsewhere in this exact manifest (Solar/
 * Galaxy/Comic's own back.nameBox), so this needs no new font import.
 *
 * The photo window is a circle/ellipse cut into the shield artwork (base.png
 * — confirmed by direct pixel inspection: base.png has no transparent hole,
 * it's fully opaque, so the ring border must be visually exposed by clipping
 * the photo to the window's own inner edge, not by any alpha cutout in the
 * base art itself). Measured against the same native canvas: centre (50%,
 * 47.5%), radius (38% of W, 16.5% of H).
 */

const PHOTO_CLIP = 'ellipse(38% 16.5% at 50% 47.5%)';
const TEXT_COLOR = '#f8dcbf';
const FONT_FAMILY = 'var(--font-barlow-condensed), "Arial Narrow", sans-serif';

const NUMBER_GEOMETRY = { left: '17.81%', bottom: '25.63%', fontSizeFactor: 0.208, comfortableChars: 2, minScale: 0.8 };
const NAME_GEOMETRY = { left: '50%', bottom: '69.23%', fontSizeFactor: 0.106, comfortableChars: 14, minScale: 0.6 };
const POSITION_GEOMETRY = { left: '50%', bottom: '73.83%', fontSizeFactor: 0.04, comfortableChars: 11, minScale: 0.85 };

type PhotoNaturalSizeProp = { photoNaturalWidth?: number; photoNaturalHeight?: number };

function toSizingArg(natural: PhotoNaturalSizeProp, boxWidth: number, boxHeight: number) {
  const { photoNaturalWidth, photoNaturalHeight } = natural;
  if (!photoNaturalWidth || !photoNaturalHeight) return null;
  return { naturalWidth: photoNaturalWidth, naturalHeight: photoNaturalHeight, boxWidth, boxHeight };
}

export default function CrimsonCardArt({
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
  const root = '/templates/custom-collection/crimson';
  const layerFit: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' };

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
        background: '#160301',
        opacity: dim ? 0.5 : 1,
        boxShadow: selected ? `0 0 0 2.5px #df3829, 0 18px 40px rgba(0,0,0,.32)` : '0 10px 30px rgba(0,0,0,.22)',
        transition: 'transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}/base.png`} alt="" style={{ ...layerFit, zIndex: 0 }} />

      {photo ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, clipPath: PHOTO_CLIP }}>
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
