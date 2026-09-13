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
 * FUT-style depth, corrected after a visual audit against the reference
 * (a first pass wrongly clipped the photo tight to the ring's own inner
 * edge — see below): base.png's own circular ring is `rearDecoration`,
 * meant to sit BEHIND the player, with the player's head/shoulders
 * overlapping it, not confined inside it. Confirmed directly by cropping
 * and zooming into the supplied reference (1.png): the player's hair
 * clearly extends above and in front of the ring's own top arc, into the
 * plain background above it — the ring is only fully visible around the
 * SIDES/below the player, exactly the classic FUT "photo breaks out of
 * the badge" look, not a photo confined to a window.
 *
 * Confirmed further via the supplied example-player cutout itself
 * (5.png, alpha bounds on the shared native canvas): top 11.75%, bottom
 * 61.88%, left 19.05%, right 81.71% — i.e. the reference's own intended
 * photo placement already reaches well above the ring's own top edge
 * (~31%) and stops almost exactly where frame-overlay.png begins
 * (~61.2%). PHOTO_CLIP below is a generous rectangle a small safety
 * margin outside that measured box (not a tight shape matching the
 * ring) — this is deliberately NOT trying to reproduce the ring's own
 * silhouette; base.png has no transparent hole for it (confirmed by
 * direct pixel inspection — fully opaque), so the ring is simply
 * painted UNDER the player and the player's own real edges (background-
 * removed for a real customer photo, via this app's own mandatory
 * BackgroundRemovalStep — see bgRemoval.ts) do the rest, the same way
 * the reference's own flattened composite does.
 *
 * Layers map onto the five standard groups as:
 *   background      — base.png, the plain backdrop portion (z0)
 *   rearDecoration   — the same base.png also carries the ring, since
 *                       there is no separate alpha-isolated ring asset
 *                       to split out — see the manifest's own comment
 *                       on why splitting it into two files wasn't
 *                       possible from the supplied flattened source
 *   player           — the customer's photo, generously bounded by
 *                       PHOTO_CLIP so it can overlap the ring while
 *                       staying inside the shield's own straight sides
 *                       and cutting off at the nameplate (z2)
 *   foregroundFrame  — frame-overlay.png + emblem-logo-position.png (z3)
 *   textAndBranding  — number/name/position (z4)
 * Player positioning (photoScale/photoOffsetX/photoOffsetY) is applied only
 * to the player <img> itself, never to any other layer.
 */

const LAYER_Z = { background: 0, player: 2, foregroundFrame: 3, textAndBranding: 4 } as const;
// Generous inset(top right bottom left) — NOT a tight window. Bottom
// (36% inset = clip ends at 64% of H) sits just past frame-overlay's own
// measured top edge (61.2%) so there's no visible gap between the photo's
// own clip and the overlay covering it; top (8%) and sides (15%) sit just
// outside the reference's own measured photo placement (11.75%/19.05%–
// 81.71%) with a small safety margin, not hugging the ring at all.
const PHOTO_CLIP = 'inset(8% 15% 36% 15%)';
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
        background: '#160301',
        opacity: dim ? 0.5 : 1,
        boxShadow: selected ? `0 0 0 2.5px #df3829, 0 18px 40px rgba(0,0,0,.32)` : '0 10px 30px rgba(0,0,0,.22)',
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
