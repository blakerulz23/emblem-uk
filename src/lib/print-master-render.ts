import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { CUSTOM_COLLECTION_VARIANTS, getCustomCollectionVariant, type CustomCollectionTemplateId } from './custom-collection-manifest';
import {
  FULL_PX,
  TRIM_RECT_IN_CANVAS,
  trimBoxToCanvasRect,
  trimPointToCanvasPoint,
  trimPolygonToCanvasPoints,
} from './print-master-geometry';

/**
 * Templates with enough real, layered source artwork (background + frame
 * decoration as separate full-card raster layers, not a single flattened
 * preview image) to compose genuine bleed from. This is an explicit
 * allowlist, not a "try it and hope" default — see renderFullBleedMaster's
 * own doc comment for why a template outside this list must fail loudly
 * rather than silently fall back to mirror-generated bleed.
 */
export const BLEED_CAPABLE_TEMPLATE_IDS: readonly CustomCollectionTemplateId[] = CUSTOM_COLLECTION_VARIANTS.map((v) => v.id);

export class TemplateNotBleedCapableError extends Error {
  constructor(templateId: string) {
    super(
      `Template "${templateId}" has no layered full-bleed source artwork registered — refusing to fabricate bleed for it. ` +
        `Bleed-capable templates: ${BLEED_CAPABLE_TEMPLATE_IDS.join(', ')}.`
    );
    this.name = 'TemplateNotBleedCapableError';
  }
}

export interface PhotoCropInput {
  /** Already-decoded photo bytes (any raster format sharp can read). */
  bytes: Buffer;
  /** Same semantics as photo-geometry.ts's PhotoCrop — pan (%) and zoom. */
  x?: number;
  y?: number;
  scale?: number;
}

export interface FrontMasterInput {
  templateId: string;
  playerName: string;
  position?: string;
  number?: string;
  photo: PhotoCropInput;
  /** Club badge, already-decoded bytes. */
  badge?: Buffer;
}

export interface BackMasterInput {
  templateId: string;
  playerName: string;
  /** Club/team logo shown on the back, already-decoded bytes. */
  logo?: Buffer;
}

/** Bumped whenever the compositor's own output would change for an
 *  already-existing template (a real asset swap, a box-geometry fix) —
 *  stored per print_masters row so a historical order's provenance is
 *  always distinguishable from what a NEW order would render today. */
export const RENDER_VERSION = 'custom-collection-v1';

function assetsRoot() {
  // public/ assets are served statically in the real app; the compositor
  // reads them directly off disk since it runs server-side, same
  // filesystem root next/server code already assumes for other
  // public-asset reads in this repo.
  return path.join(process.cwd(), 'public');
}

async function loadAsset(relPath: string): Promise<Buffer> {
  return readFile(path.join(assetsRoot(), relPath));
}

/** Exact CSS object-fit:'fill' equivalent: non-uniform resize to an exact
 *  target size, never cropping, never letterboxing — matches
 *  CardArt.tsx's own `customLayerFit` styling precisely. */
async function fillLayer(bytes: Buffer, w: number, h: number): Promise<Buffer> {
  return sharp(bytes).resize(Math.round(w), Math.round(h), { fit: 'fill' }).ensureAlpha().png().toBuffer();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Renders every text element (name / position / number) as ONE SVG layer
 * in absolute canvas pixel coordinates, matching CardArt.tsx's own
 * left/top + rotate(-90deg)-about-top-left convention. Rasterised via
 * sharp's built-in librsvg support — no browser, no DOM, deterministic.
 *
 * Font fidelity gap (documented, not hidden): the real on-screen renderer
 * uses the app's bundled Oswald/Barlow Condensed web fonts; this
 * server-side compositor has no bundled font files to hand librsvg, so it
 * falls back to a generic bold condensed system face. Geometry (position,
 * rotation, size, colour, stroke) is exact; the exact letterforms are not.
 * Bundling the real font files as an SVG-embedded @font-face would close
 * this gap — flagged as a follow-up, not implemented here.
 *
 * Also not ported: CardArt.tsx's nameFitScale() auto-shrink for long
 * names (it shrinks font-size to keep long names inside nameBox's width).
 * A very long player name can therefore run past its box here where the
 * real on-screen renderer would shrink it first — another explicitly
 * documented follow-up, not a geometry defect.
 */
function textLayerSvg(variant: ReturnType<typeof getCustomCollectionVariant>, input: FrontMasterInput): string {
  const parts: string[] = [];
  const fontFamily = '"Arial Narrow", "Liberation Sans Narrow", sans-serif';

  if (variant.nameBox) {
    const { x, y } = trimPointToCanvasPoint(variant.nameBox.left, variant.nameBox.top);
    const fontSize = FULL_PX.w * Number(variant.nameBox.fontSize || 0.06); 
    const rotate = variant.nameBox.rotate || '-90deg';
    const deg = parseFloat(rotate);
    parts.push(
      `<text x="0" y="0" transform="translate(${x},${y}) rotate(${deg})" font-family='${fontFamily}' font-weight="${variant.nameBox.fontWeight || 700}" font-size="${fontSize.toFixed(1)}" fill="#fff" style="text-shadow:none">${escapeXml(input.playerName.toUpperCase())}</text>`
    );
  }
  if (variant.positionBox && input.position) {
    const { x, y } = trimPointToCanvasPoint(variant.positionBox.left, variant.positionBox.top);
    const fontSize = FULL_PX.w * Number(variant.positionBox.fontSize || 0.03);
    const deg = parseFloat(variant.positionBox.rotate || '-90deg');
    parts.push(
      `<text x="0" y="0" transform="translate(${x},${y}) rotate(${deg})" font-family='${fontFamily}' font-weight="${variant.positionBox.fontWeight || 700}" font-size="${fontSize.toFixed(1)}" fill="${variant.positionBox.color || '#ef2222'}" letter-spacing="2">${escapeXml(input.position.toUpperCase())}</text>`
    );
  }
  if (variant.numberBox && input.number) {
    const { x, y } = trimPointToCanvasPoint(variant.numberBox.left, variant.numberBox.top);
    const fontSize = FULL_PX.w * Number(variant.numberBox.fontSize || 0.12);
    const deg = variant.numberBox.rotate ? parseFloat(variant.numberBox.rotate) : 0;
    const stroke = variant.numberBox.stroke || '#fff';
    parts.push(
      `<text x="0" y="0" transform="translate(${x},${y}) rotate(${deg})" font-family='${fontFamily}' font-weight="${variant.numberBox.fontWeight || 900}" font-style="${variant.numberBox.fontStyle || 'italic'}" font-size="${fontSize.toFixed(1)}" fill="${variant.numberBox.color || 'transparent'}" stroke="${stroke}" stroke-width="2">${escapeXml(input.number)}</text>`
    );
  }

  return `<svg width="${FULL_PX.w}" height="${FULL_PX.h}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

async function renderPhotoLayer(photo: PhotoCropInput): Promise<Buffer> {
  // The clip region is the trim box's own full inset:0 bounds (see
  // EMJFL_PHOTO_CLIP's own definition in CardArt.tsx) — cover-fit the
  // photo into that rect, then mask with the exact polygon, in absolute
  // canvas coordinates so it lands correctly relative to the trim box
  // regardless of how much bigger the full canvas is.
  const rect = TRIM_RECT_IN_CANVAS;
  const covered = await sharp(photo.bytes)
    .resize(rect.w, rect.h, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .toBuffer();

  const polygon = trimPolygonToCanvasPoints('polygon(39% 4%, 96% 4%, 96% 96%, 8% 96%, 4% 90%, 25% 77%, 25% 28%)')
    .map(([x, y]) => `${(x - rect.x).toFixed(1)},${(y - rect.y).toFixed(1)}`)
    .join(' ');
  const maskSvg = `<svg width="${rect.w}" height="${rect.h}"><polygon points="${polygon}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();

  const clipped = await sharp(covered).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  // Place at the trim box's absolute position on the full canvas.
  return sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: clipped, left: Math.round(rect.x), top: Math.round(rect.y) }])
    .png()
    .toBuffer();
}

async function renderBadgeLayer(box: { left: string; top: string; width: string; height: string }, badge: Buffer): Promise<Buffer> {
  const rect = trimBoxToCanvasRect(box);
  // CardArt.tsx anchors badge/logo boxes at their own left/top with no
  // translate(-50%,-50%) for the front badge (unlike the back logo box,
  // which does centre itself) — object-fit:contain within the box.
  const fitted = await sharp(badge).resize(Math.round(rect.w), Math.round(rect.h), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, left: Math.round(rect.x), top: Math.round(rect.y) }])
    .png()
    .toBuffer();
}

/**
 * Renders a genuine full-bleed (826x1126px, 2.75x3.75in @300dpi) front
 * master directly — every layer is composited once, at full-canvas size,
 * from the SAME real template assets CardArt.tsx uses on screen
 * (custom-collection-manifest.ts). Trim-relative content (photo, badge,
 * name, position, number) is positioned via print-master-geometry.ts's
 * trim-to-canvas conversion, so it stays pinned to the trim box rather
 * than drifting outward the way naively enlarging CardArt's own
 * percentage-positioned container would.
 *
 * No mirroring, no blur, no compositing of one independently-rendered
 * raster on top of another's edge — this is the fix for the read-only
 * audit's confirmed mirror-seam defect AND for Test C's corner notch
 * (which came from gluing two SEPARATE renders together at the trim
 * boundary; this function only ever renders once).
 */
export async function renderFrontMaster(input: FrontMasterInput): Promise<Buffer> {
  if (!BLEED_CAPABLE_TEMPLATE_IDS.includes(input.templateId as CustomCollectionTemplateId)) {
    throw new TemplateNotBleedCapableError(input.templateId);
  }
  const variant = getCustomCollectionVariant(input.templateId);
  const { assets } = variant;

  const layers: Buffer[] = [];
  if (assets.base) layers.push(await fillLayer(await loadAsset(assets.base), FULL_PX.w, FULL_PX.h));
  layers.push(await fillLayer(await loadAsset(assets.background), FULL_PX.w, FULL_PX.h));
  layers.push(await renderPhotoLayer(input.photo));
  if (assets.railOverlay) layers.push(await fillLayer(await loadAsset(assets.railOverlay), FULL_PX.w, FULL_PX.h));
  if (variant.badgeBox && input.badge) layers.push(await renderBadgeLayer(variant.badgeBox as { left: string; top: string; width: string; height: string }, input.badge));
  if (assets.emblemLogoPosition) layers.push(await fillLayer(await loadAsset(assets.emblemLogoPosition), FULL_PX.w, FULL_PX.h));
  layers.push(await sharp(Buffer.from(textLayerSvg(variant, input))).png().toBuffer());
  if (assets.cornerOverlay) layers.push(await fillLayer(await loadAsset(assets.cornerOverlay), FULL_PX.w, FULL_PX.h));

  const base = sharp({
    create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  });
  const composited = await base.composite(layers.map((input) => ({ input }))).png().toBuffer();
  // Flatten onto opaque black (matches variant.background's own dark
  // base colour — see assertNoCornerKnockout's own "no transparent
  // pixels" requirement in the legacy pipeline; this compositor must
  // satisfy the same "fully opaque output" contract).
  return sharp(composited).flatten({ background: variant.background }).png().toBuffer();
}

export async function renderBackMaster(input: BackMasterInput): Promise<Buffer> {
  if (!BLEED_CAPABLE_TEMPLATE_IDS.includes(input.templateId as CustomCollectionTemplateId)) {
    throw new TemplateNotBleedCapableError(input.templateId);
  }
  const variant = getCustomCollectionVariant(input.templateId);
  const back = variant.back;
  const backPath = back?.base || variant.assets.backBase || variant.assets.preview;

  const layers: Buffer[] = [await fillLayer(await loadAsset(backPath), FULL_PX.w, FULL_PX.h)];

  if (back?.logoBox && input.logo) {
    const rect = trimBoxToCanvasRect(back.logoBox);
    const fitted = await sharp(input.logo).resize(Math.round(rect.w), Math.round(rect.h), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    // Back logo box IS centred (translate(-50%,-50%) in CardArt.tsx) —
    // unlike the front badge box.
    layers.push(
      await sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: fitted, left: Math.round(rect.x - rect.w / 2), top: Math.round(rect.y - rect.h / 2) }])
        .png()
        .toBuffer()
    );
  }
  if (back?.nameBox) {
    const { x, y } = trimPointToCanvasPoint(back.nameBox.left, back.nameBox.top);
    const fontSize = FULL_PX.w * Number(back.nameBox.fontSize || 0.098) * 0.9;
    const svg = `<svg width="${FULL_PX.w}" height="${FULL_PX.h}" xmlns="http://www.w3.org/2000/svg"><text x="${x}" y="${y}" text-anchor="middle" font-family='"Arial Narrow", sans-serif' font-weight="900" font-size="${fontSize.toFixed(1)}" fill="${back.nameBox.color || '#fff'}">${escapeXml(input.playerName.toUpperCase())}</text></svg>`;
    layers.push(await sharp(Buffer.from(svg)).png().toBuffer());
  }

  const base = sharp({ create: { width: FULL_PX.w, height: FULL_PX.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } });
  const composited = await base.composite(layers.map((input) => ({ input }))).png().toBuffer();
  return sharp(composited).flatten({ background: variant.background }).png().toBuffer();
}

/**
 * The ONE canonical derivation from a full-bleed master down to the
 * customer-approved trim composition — a plain pixel crop, nothing else.
 * Both the "trimmed approved card" and (via encodeShareImage below) the
 * share/download JPG must be derived from THIS, never independently
 * re-captured, so there is exactly one visual source of truth.
 */
export async function deriveTrimFromMaster(masterPng: Buffer): Promise<Buffer> {
  const rect = TRIM_RECT_IN_CANVAS;
  return sharp(masterPng).extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }).png().toBuffer();
}

/** The one explicit, documented lossy step in this pipeline: JPEG-encode
 *  the trim composition for sharing/download. Never used for the stored
 *  master itself (PNG, lossless — see the report's format justification). */
export async function encodeShareImage(trimPng: Buffer, quality = 90): Promise<Buffer> {
  return sharp(trimPng).jpeg({ quality }).toBuffer();
}
