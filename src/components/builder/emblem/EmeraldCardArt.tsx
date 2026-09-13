import type { CSSProperties } from 'react';
import { computePhotoGeometry } from '@/lib/photo-geometry';
import { nameFitScale } from '@/lib/nameplate-typography';
import { positionCardLabel } from '@/lib/player-position';
import type { CardTemplate, Details } from './data';

/**
 * Emerald Edition (Custom Collection) — the same horizontal, centred
 * name/position/number layout as Crimson/Royal (see CrimsonCardArt.tsx's
 * own doc comment for the full reasoning), not the shared rotated-
 * nameplate structure Solar/Galaxy/Comic use. Same underlying 1050x1498
 * Canva template family (near-identical photo-window geometry to
 * Crimson/Royal, confirmed by direct measurement), themed emerald green/
 * gold. Measured directly from the supplied reference layers:
 *
 *   number ("6" reference, 36.png):   centre-x 17.81%, bottom-anchor 25.50%
 *   name ("JOSH THOMPSON", 39.png):   centre-x ~50%, bottom-anchor 68.89%
 *   position ("MIDFIELDER", 40.png):  centre-x ~50%, bottom-anchor 73.90%
 *
 * Genuine difference from Crimson/Royal, confirmed by direct colour
 * sampling (not assumed): all three glyphs are two-tone — a pale gold fill
 * (#f8e9b1) over a darker olive-gold outline (#806600), not a single solid
 * fill. Rendered as a layered fill+outline pair (a slightly larger,
 * outline-coloured copy behind the true-size fill copy) rather than a CSS
 * text-stroke — the same non-destructive technique
 * nameplate-typography.ts's own nameplateNumberLayers uses for the shared
 * rotated system's kit number, and for the same reason: a stroke thick
 * enough to match this outline would close narrow letterforms/digit
 * counters (e.g. "O", "D", "6"'s own bowl). Reimplemented locally
 * (layeredText below) rather than reusing nameplateNumberLayers directly,
 * since that helper's own geometry shape (bottom-anchored + rotation
 * support wired for the shared plate system) doesn't fit name/position
 * here, and its own NAMEPLATE_NUMBER_GEOMETRY is a different, unrelated
 * card family's measurement.
 *
 * Font: Barlow Condensed Bold — same evidence-based match as Crimson/Royal
 * (same underlying template family, same letterforms), already loaded.
 *
 * The photo window is a circle cut into the shield artwork (base.png —
 * confirmed via direct pixel inspection to be fully opaque, same as
 * Crimson/Royal's own base.png). Measured against this template's own
 * native canvas: centre (50%, 48%), radius (39% of W, 20% of H) — visibly
 * rounder than Crimson/Royal's own flatter ellipse, so measured fresh
 * rather than reused.
 */

const PHOTO_CLIP = 'ellipse(39% 20% at 50% 48%)';
const FILL_COLOR = '#f8e9b1';
const OUTLINE_COLOR = '#806600';
const OUTLINE_SCALE = 1.08;
const FONT_FAMILY = 'var(--font-barlow-condensed), "Arial Narrow", sans-serif';

const NUMBER_GEOMETRY = { left: '17.81%', bottom: '25.50%', fontSizeFactor: 0.21, comfortableChars: 2, minScale: 0.8 };
const NAME_GEOMETRY = { left: '50%', bottom: '68.89%', fontSizeFactor: 0.105, comfortableChars: 14, minScale: 0.6 };
const POSITION_GEOMETRY = { left: '50%', bottom: '73.90%', fontSizeFactor: 0.048, comfortableChars: 11, minScale: 0.85 };

type TextGeometry = { left: string; bottom: string; fontSizeFactor: number; comfortableChars: number; minScale: number };

/**
 * Builds the layered fill+outline style pair for one horizontal, centred,
 * bottom-anchored text slot — see this file's own doc comment above for why
 * layering (not a text-stroke) is used.
 *
 * The wrapper gets an EXPLICIT width and height (not left to shrink-wrap an
 * inline-block sized by its own in-flow child) and both the fill and
 * outline spans are centred inside it independently via
 * `display:grid;placeItems:center` — deliberately avoiding the
 * position:absolute;inset:0 inside an auto-sized display:inline-block
 * pattern nameplateNumberLayers uses for the shared rotated system's own
 * kit number. That pattern relies on the browser sizing the inline-block
 * parent from its one in-flow child (fill) and then stretching the
 * absolutely-positioned sibling (outline) to match via inset:0 — correct
 * per spec, but confirmed by direct Playwright measurement to
 * intermittently paint the outline copy at a visibly different, larger
 * size/position than the fill copy in this component (a real, reproduced
 * rendering defect, not a misreading of a thick outline — isolated via
 * getBoundingClientRect and a highlighted wrapper box). The outline's own
 * enlargement is done via a literal larger fontSize here, not
 * `transform:scale`, removing the transform/compositing step entirely as
 * a possible contributor.
 */
function layeredText(W: number, geom: TextGeometry, text: string, extraWrapper?: CSSProperties) {
  const scale = nameFitScale(text, geom.comfortableChars, geom.minScale);
  const fillSize = W * geom.fontSizeFactor * scale;
  const outlineSize = fillSize * OUTLINE_SCALE;
  const sharedSpan: CSSProperties = {
    gridArea: '1 / 1',
    fontFamily: FONT_FAMILY,
    fontWeight: 800,
    lineHeight: 1,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  };
  return {
    wrapper: {
      position: 'absolute' as const,
      left: geom.left,
      top: geom.bottom,
      transform: 'translate(-50%, -100%)',
      display: 'grid' as const,
      placeItems: 'center' as const,
      height: fillSize * 1.3,
      ...extraWrapper,
    },
    outline: { ...sharedSpan, fontSize: outlineSize, color: OUTLINE_COLOR },
    fill: { ...sharedSpan, fontSize: fillSize, color: FILL_COLOR, position: 'relative' as const },
  };
}

type PhotoNaturalSizeProp = { photoNaturalWidth?: number; photoNaturalHeight?: number };

function toSizingArg(natural: PhotoNaturalSizeProp, boxWidth: number, boxHeight: number) {
  const { photoNaturalWidth, photoNaturalHeight } = natural;
  if (!photoNaturalWidth || !photoNaturalHeight) return null;
  return { naturalWidth: photoNaturalWidth, naturalHeight: photoNaturalHeight, boxWidth, boxHeight };
}

export default function EmeraldCardArt({
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
  const root = '/templates/custom-collection/emerald';
  const layerFit: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' };

  const playerName = d.name || 'Player Name';
  const positionLabel = positionCardLabel(d.position, 'POSITION');
  const number = d.number || '10';

  const numberLayers = layeredText(W, NUMBER_GEOMETRY, number);
  const nameLayers = layeredText(W, NAME_GEOMETRY, playerName, { width: '86%' });
  const positionLayers = layeredText(W, POSITION_GEOMETRY, positionLabel, { width: '80%' });
  (positionLayers.outline as CSSProperties).letterSpacing = '0.1em';
  (positionLayers.fill as CSSProperties).letterSpacing = '0.1em';

  return (
    <div
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        borderRadius: W * 0.045,
        background: '#04160d',
        opacity: dim ? 0.5 : 1,
        boxShadow: selected ? `0 0 0 2.5px #1f8a52, 0 18px 40px rgba(0,0,0,.32)` : '0 10px 30px rgba(0,0,0,.22)',
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

      <div style={{ ...numberLayers.wrapper, zIndex: 4 }}>
        <span aria-hidden style={numberLayers.outline}>{number}</span>
        <span style={numberLayers.fill}>{number}</span>
      </div>

      <div style={{ ...nameLayers.wrapper, zIndex: 4 }}>
        <span aria-hidden style={nameLayers.outline}>{playerName}</span>
        <span style={nameLayers.fill}>{playerName}</span>
      </div>

      <div style={{ ...positionLayers.wrapper, zIndex: 4 }}>
        <span aria-hidden style={positionLayers.outline}>{positionLabel}</span>
        <span style={positionLayers.fill}>{positionLabel}</span>
      </div>
    </div>
  );
}
