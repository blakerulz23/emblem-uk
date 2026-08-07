import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { PRINT_SPECS, ProductKind, pdfPageSize } from './print-specs';

export interface DesignPayload {
  product: ProductKind;
  /** Front-side image as data URL or http URL */
  frontImageDataUrl: string;
  /** Back-side image (cards only); if absent, generic back is used */
  backImageDataUrl?: string;
  /** Customer-visible metadata to embed in PDF metadata */
  meta?: {
    playerName?: string;
    teamName?: string;
    template?: string;
    orderRef?: string;
  };
}

/**
 * Decode a data URL or fetch a remote URL into a Uint8Array of image bytes.
 */
async function loadImageBytes(input: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (input.startsWith('data:')) {
    const [head, b64] = input.split(',');
    const mime = head.substring(head.indexOf(':') + 1, head.indexOf(';')) || 'image/png';
    const bin = Buffer.from(b64, 'base64');
    return { bytes: new Uint8Array(bin), mime };
  }
  const r = await fetch(input);
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = r.headers.get('content-type') || 'image/png';
  return { bytes: new Uint8Array(buf), mime };
}

/**
 * How far a raster's own aspect ratio may drift from the print spec's trim
 * ratio before generation refuses to proceed rather than silently
 * stretching it. The design is always authored at the trim ratio (e.g. a
 * card's 340x476 capture matches PRINT_SPECS.card's 2.5x3.5in trim
 * exactly), so any real capture should land inside this with room to
 * spare — it exists to catch a capture-rig regression (wrong element size,
 * wrong product mapping) rather than a legitimate design choice.
 */
const SOURCE_ASPECT_TOLERANCE = 0.015;

/**
 * Softens the bleed margin only, in-place — a plain mirror-extend of a
 * rounded card corner reflects the corner curve itself, producing a
 * visible doubled/lens-shaped seam right at the fold (confirmed by direct
 * pixel inspection; a template-aware per-layer bleed would avoid this too,
 * but would require rendering a second, larger capture at DOM level for
 * every template family — this achieves the same "no visible seam"
 * requirement entirely inside this function, no capture-rig change). A
 * blurred colour continuation reads as ordinary bleed rather than a
 * reflection; the trim content is pasted back on top afterwards
 * unblurred, so nothing inside the trim line is ever softened.
 */
const BLEED_SOFTEN_RADIUS = 12;

/**
 * Builds a genuine full-bleed raster from a trim-ratio source, WITHOUT
 * scaling the trim composition itself: the source is resized by a single
 * uniform factor onto an exact trim-pixel canvas (never cropped, never
 * distorted — a resolution-normalising resize only, since the source
 * already matches the trim ratio within SOURCE_ASPECT_TOLERANCE), then the
 * bleed margin is added from the card's own edge colour (mirrored, then
 * softened — see BLEED_SOFTEN_RADIUS) so background/frame/edge artwork
 * extends into bleed without ever enlarging the player photo, name,
 * badge or any other trim-relative content. The trim rectangle this
 * produces is pixel-equivalent (up to the DPI resample) to the same
 * design at 1x, matching Emblem OS, not a zoomed-in crop of it. The bleed
 * strip is never visible on the finished product — it exists only as the
 * printer's cutting-tolerance margin.
 */
export async function buildFullBleedRaster(
  sourceBytes: Uint8Array,
  spec: { finalWidthIn: number; finalHeightIn: number; bleedIn: number; dpi: number }
): Promise<Buffer> {
  const trimPxW = Math.round(spec.finalWidthIn * spec.dpi);
  const trimPxH = Math.round(spec.finalHeightIn * spec.dpi);
  const bleedPx = Math.round(spec.bleedIn * spec.dpi);

  const trimmed = await sharp(sourceBytes)
    .resize(trimPxW, trimPxH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const mirrorExtended = await sharp(trimmed)
    .extend({ top: bleedPx, bottom: bleedPx, left: bleedPx, right: bleedPx, extendWith: 'mirror' })
    .png()
    .toBuffer();

  const softened = await sharp(mirrorExtended).blur(BLEED_SOFTEN_RADIUS).toBuffer();

  return sharp(softened)
    .composite([{ input: trimmed, left: bleedPx, top: bleedPx }])
    .png()
    .toBuffer();
}

/** Build a print-ready PDF from a design payload. */
export async function buildPdf(payload: DesignPayload): Promise<Buffer> {
  const spec = PRINT_SPECS[payload.product];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Print: ${spec.label}`);
  pdf.setAuthor('Emblem / Last Shot Cards');
  if (payload.meta?.orderRef) pdf.setSubject(`Order ${payload.meta.orderRef}`);
  if (payload.meta) pdf.setKeywords(Object.entries(payload.meta).map(([k, v]) => `${k}:${v}`));

  const { width, height } = pdfPageSize(spec);
  // The trim size (e.g. 2.5x3.5in) is the ratio the design is actually
  // authored at — the bleed-inclusive page is a slightly different ratio
  // (bleed adds a fixed amount to each edge, which shifts the ratio away
  // from trim unless width and height happen to share the same margin
  // fraction). That's expected geometry, not something to "fix" by
  // scaling the design to match the page — see buildFullBleedRaster.
  const trimAspect = spec.finalWidthIn / spec.finalHeightIn;

  const addPage = async (imageDataUrl: string) => {
    const page = pdf.addPage([width, height]);
    const { bytes: sourceBytes } = await loadImageBytes(imageDataUrl);
    const sourceMeta = await sharp(sourceBytes).metadata();
    if (!sourceMeta.width || !sourceMeta.height) {
      throw new Error('Could not read the print source image dimensions.');
    }

    const sourceAspect = sourceMeta.width / sourceMeta.height;
    if (Math.abs(sourceAspect - trimAspect) / trimAspect > SOURCE_ASPECT_TOLERANCE) {
      throw new Error(
        `Print source aspect ratio ${sourceAspect.toFixed(4)} does not match the ${payload.product} trim ratio ${trimAspect.toFixed(4)} ` +
          `(tolerance ${(SOURCE_ASPECT_TOLERANCE * 100).toFixed(1)}%) — refusing to stretch the design into the page.`
      );
    }

    // Genuine bleed: the trim composition is mapped to the page at a
    // single uniform scale (via the DPI-normalising resize inside
    // buildFullBleedRaster) with the bleed margin coming from mirrored
    // edge pixels, not from enlarging the whole card. The resulting raster
    // already matches the page's exact aspect ratio by construction, so
    // this is a plain 1:1 fit — no cover/crop math, no independent X/Y
    // factors, nothing left to distort.
    const bleedRaster = await buildFullBleedRaster(sourceBytes, spec);
    const img = await pdf.embedPng(bleedRaster);
    page.drawImage(img, { x: 0, y: 0, width, height });

    // Crop marks at bleed edge
    const bleedPt = spec.bleedIn * 72;
    const markLen = 12;
    const k = rgb(0, 0, 0);
    // Top-left
    page.drawLine({ start: { x: 0, y: height - bleedPt }, end: { x: markLen, y: height - bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: bleedPt, y: height }, end: { x: bleedPt, y: height - markLen }, thickness: 0.5, color: k });
    // Top-right
    page.drawLine({ start: { x: width, y: height - bleedPt }, end: { x: width - markLen, y: height - bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width - bleedPt, y: height }, end: { x: width - bleedPt, y: height - markLen }, thickness: 0.5, color: k });
    // Bottom-left
    page.drawLine({ start: { x: 0, y: bleedPt }, end: { x: markLen, y: bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: bleedPt, y: 0 }, end: { x: bleedPt, y: markLen }, thickness: 0.5, color: k });
    // Bottom-right
    page.drawLine({ start: { x: width, y: bleedPt }, end: { x: width - markLen, y: bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width - bleedPt, y: 0 }, end: { x: width - bleedPt, y: markLen }, thickness: 0.5, color: k });
  };

  // Front page
  await addPage(payload.frontImageDataUrl);

  // Cards are double-sided. If no back provided, draw a simple branded back.
  if (spec.pages === 2) {
    if (payload.backImageDataUrl) {
      await addPage(payload.backImageDataUrl);
    } else {
      const page = pdf.addPage([width, height]);
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0, 0, 0) });
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const text = 'LAST SHOT';
      const textSize = Math.min(width, height) * 0.12;
      const tw = font.widthOfTextAtSize(text, textSize);
      page.drawText(text, {
        x: (width - tw) / 2,
        y: height / 2 - textSize / 2,
        size: textSize,
        font,
        color: rgb(0.066, 0.427, 1),  // #116DFF
      });
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
