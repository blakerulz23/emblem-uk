import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { PRINT_SPECS, ProductKind, pdfPageSize } from './print-specs';
import { validateMasterBytes } from './print-master-validation';

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
 * Softens the bleed margin only, in-place — mirror-extending a card whose
 * corners carry real template artwork right to the edge (see
 * assertNoCornerKnockout's doc comment for why that precondition matters)
 * still produces a visible doubled seam for any hard edge feature sitting
 * right at the trim boundary. A blurred colour continuation reads as
 * ordinary bleed rather than a reflection; the trim content is pasted back
 * on top afterwards unblurred, so nothing inside the trim line is ever
 * softened.
 */
const BLEED_SOFTEN_RADIUS = 12;

/**
 * Size (as a multiple of bleedPx, clamped to [12, 60]px) of the square
 * window sampled at each of the trim's own 4 corners when checking for a
 * knockout. Tuned empirically (this audit) against a reproduction of the
 * confirmed defect: 0.6x the bleed width sits comfortably inside a typical
 * CardArt rounded-corner radius (borderRadius: W * 0.05) without growing so
 * large that real template colour surrounding the corner dilutes the
 * near-white fraction below the detection threshold.
 */
const CORNER_CHECK_WINDOW_BLEED_MULTIPLE = 0.6;

/**
 * A corner window counting as "near-white" above this fraction, combined
 * with the whole-raster median-brightness gate below, is treated as a
 * knockout. A reproduction of the confirmed defect measures ~0.5-1.0 at
 * this window size; a knockout-free source measures 0.0.
 */
const CORNER_NEAR_WHITE_FRACTION_THRESHOLD = 0.4;
const CORNER_NEAR_WHITE_CHANNEL_MIN = 245;

/**
 * Gaussian blur (see BLEED_SOFTEN_RADIUS) leaves harmless ±2 rounding noise
 * on an otherwise-uniform alpha channel even when every input pixel was
 * fully opaque (confirmed empirically) — same class of PNG re-encode
 * rounding this file's other tests already tolerate. A real transparency
 * leak (unresized contain-padding, a source with a genuine alpha channel)
 * reads far below this.
 */
const OPAQUE_ALPHA_MIN = 250;
const CORNER_NON_OPAQUE_FRACTION_THRESHOLD = 0.1;

/**
 * A raster whose overall median brightness is at or above this is treated
 * as a legitimately light/white template (e.g. the "Clean" family, or a
 * light-finish Galaxy variant) — those are light everywhere, not just at
 * the four corners, so they must not trip the corner check below.
 */
const LEGITIMATELY_LIGHT_TEMPLATE_MEDIAN_BRIGHTNESS = 235;

/**
 * Confirmed root cause (this audit): the print-capture rig rasterises the
 * on-screen CardArt element with html2canvas's own opaque white
 * backgroundColor painted first. CardArt's outer element clips to a
 * rounded rect (borderRadius + overflow:hidden) while its background/frame
 * <img> layers underneath are already full width:100%/height:100%
 * rectangles — so the four small triangles the rounded clip removes are not
 * "missing" template artwork, they're real opaque white pixels painted by
 * the capture itself. buildFullBleedRaster then mirrors and blurs whatever
 * sits at the trim edge into the bleed margin, turning those white corner
 * triangles into the pale blurred blobs seen in the full-bleed raster.
 *
 * The actual fix is upstream of this function: the print-capture call
 * sites (ProductionBuilder.tsx's capture rig, RegeneratePdfButton.tsx) now
 * pass `style={{ borderRadius: 0 }}` through CardFace/CardArt for print
 * captures only — on-screen rendering is untouched — so the captured
 * source already has real template colour/texture in all four corners
 * before it ever reaches this function. This check is the safety net: if a
 * knockout-white source ever reaches buildFullBleedRaster again (a future
 * capture-rig regression, a template family that bypasses CardFace), it is
 * caught here rather than silently shipped baked into a customer's PDF.
 */
async function assertNoCornerKnockout(bleedRasterPng: Buffer, bleedPx: number): Promise<void> {
  const { data, info } = await sharp(bleedRasterPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let brightnessSum = 0;
  let sampleCount = 0;
  const stride = channels * 37; // sparse sample — this is a whole-raster tone estimate, not a precision measurement
  for (let i = 0; i + 2 < data.length; i += stride) {
    brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    sampleCount++;
  }
  const medianBrightnessApprox = brightnessSum / Math.max(1, sampleCount);
  if (medianBrightnessApprox >= LEGITIMATELY_LIGHT_TEMPLATE_MEDIAN_BRIGHTNESS) return;

  // Anchored at the TRIM's own corner (bleedPx in from the raster edge), not
  // the outer bleed edge — empirically confirmed (this audit) to be where a
  // knockout concentrates: the trim content is composited back on top of the
  // blurred bleed layer completely unblurred, so a knockout source's own
  // corner survives here exactly as sharp and white as the input, while the
  // mirrored copy further out in the bleed margin gets diluted by the blur.
  // This is also the highest cutting-tolerance-risk zone in practice — the
  // pixels nearest the intended rounded die-cut line.
  const win = Math.min(Math.max(Math.round(bleedPx * CORNER_CHECK_WINDOW_BLEED_MULTIPLE), 12), 60);
  const corners = [
    { name: 'top-left', x0: bleedPx, y0: bleedPx },
    { name: 'top-right', x0: width - bleedPx - win, y0: bleedPx },
    { name: 'bottom-left', x0: bleedPx, y0: height - bleedPx - win },
    { name: 'bottom-right', x0: width - bleedPx - win, y0: height - bleedPx - win },
  ];

  for (const corner of corners) {
    let nearWhite = 0;
    let nonOpaque = 0;
    let total = 0;
    const xStart = Math.max(0, corner.x0);
    const yStart = Math.max(0, corner.y0);
    for (let y = yStart; y < Math.min(height, corner.y0 + win); y++) {
      for (let x = xStart; x < Math.min(width, corner.x0 + win); x++) {
        const i = (y * width + x) * channels;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        total++;
        if (a < OPAQUE_ALPHA_MIN) nonOpaque++;
        if (r > CORNER_NEAR_WHITE_CHANNEL_MIN && g > CORNER_NEAR_WHITE_CHANNEL_MIN && b > CORNER_NEAR_WHITE_CHANNEL_MIN) nearWhite++;
      }
    }
    // A source within SOURCE_ASPECT_TOLERANCE of the trim ratio can still
    // legitimately get a sliver of transparent contain-padding (sub-pixel
    // rounding, not a defect) — fraction-gated for the same reason the
    // near-white check below is, rather than zero-tolerance.
    const nonOpaqueFraction = nonOpaque / total;
    if (nonOpaqueFraction > CORNER_NON_OPAQUE_FRACTION_THRESHOLD) {
      throw new Error(
        `Full-bleed raster corner "${corner.name}" is ${(nonOpaqueFraction * 100).toFixed(0)}% non-opaque (${nonOpaque} of ${total} sampled pixels) — print output must be fully opaque.`
      );
    }
    const nearWhiteFraction = nearWhite / total;
    if (nearWhiteFraction > CORNER_NEAR_WHITE_FRACTION_THRESHOLD) {
      throw new Error(
        `Full-bleed raster corner "${corner.name}" is ${(nearWhiteFraction * 100).toFixed(0)}% near-white against a ${medianBrightnessApprox.toFixed(0)}/255 whole-raster brightness — looks like an unpainted rounded-corner knockout baked into the print source rather than template artwork. Refusing to build a PDF that could expose white under cutting tolerance.`
      );
    }
  }
}

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
 *
 * Requires the source to already have real artwork under its rounded
 * corners (see assertNoCornerKnockout) — enforced by the print-capture
 * call sites rendering unclipped for print, checked here as a safety net.
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

  const bleedRaster = await sharp(softened)
    .composite([{ input: trimmed, left: bleedPx, top: bleedPx }])
    .png()
    .toBuffer();

  await assertNoCornerKnockout(bleedRaster, bleedPx);

  return bleedRaster;
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

/**
 * Verified print-master PDF path — the replacement for buildFullBleedRaster
 * for any order that has a real, stored full-bleed master (print-master-
 * render.ts + print-master-storage.ts). No mirror, no blur, no fit/cover/
 * contain math: the master is already a genuine, correctly-composed
 * 826x1126px full-bleed raster, so this only ever draws it 1:1 across the
 * page. Crop marks are added here as separate PDF vector instructions,
 * exactly as the legacy path already does — never baked into the master
 * PNG itself (see print-master-render.ts's own "no crop marks" contract).
 *
 * Every master is re-validated here (dimensions, MIME, digest) even though
 * print-master-storage.ts's fetchVerifiedPrintMaster already validates on
 * read — this function must never trust a caller that skipped that step,
 * since a malformed/wrong-size/tampered buffer reaching page.drawImage
 * with width/height hardcoded to the page size would otherwise silently
 * stretch or corrupt the output exactly like the defect this whole
 * workflow exists to eliminate.
 */
export interface VerifiedMasterInput {
  bytes: Buffer;
  expectedSha256: string;
}

export async function buildPdfFromVerifiedMasters(params: {
  front: VerifiedMasterInput;
  back: VerifiedMasterInput;
  meta?: DesignPayload['meta'];
}): Promise<Buffer> {
  const spec = PRINT_SPECS.card;
  const { width, height } = pdfPageSize(spec);

  const front = await validateMasterBytes({ bytes: params.front.bytes, expectedSha256: params.front.expectedSha256 });
  const back = await validateMasterBytes({ bytes: params.back.bytes, expectedSha256: params.back.expectedSha256 });

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Print: ${spec.label} (verified master)`);
  pdf.setAuthor('Emblem / Last Shot Cards');
  if (params.meta?.orderRef) pdf.setSubject(`Order ${params.meta.orderRef}`);
  if (params.meta) pdf.setKeywords(Object.entries(params.meta).map(([k, v]) => `${k}:${v}`));

  const bleedPt = spec.bleedIn * 72;
  const markLen = 12;
  const k = rgb(0, 0, 0);
  const drawCropMarks = (page: Awaited<ReturnType<typeof pdf.addPage>>) => {
    page.drawLine({ start: { x: 0, y: height - bleedPt }, end: { x: markLen, y: height - bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: bleedPt, y: height }, end: { x: bleedPt, y: height - markLen }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width, y: height - bleedPt }, end: { x: width - markLen, y: height - bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width - bleedPt, y: height }, end: { x: width - bleedPt, y: height - markLen }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: 0, y: bleedPt }, end: { x: markLen, y: bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: bleedPt, y: 0 }, end: { x: bleedPt, y: markLen }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width, y: bleedPt }, end: { x: width - markLen, y: bleedPt }, thickness: 0.5, color: k });
    page.drawLine({ start: { x: width - bleedPt, y: 0 }, end: { x: width - bleedPt, y: markLen }, thickness: 0.5, color: k });
  };

  for (const validated of [front, back]) {
    const page = pdf.addPage([width, height]);
    const img = await pdf.embedPng(validated.bytes);
    // Direct 1:1 placement — no fit/cover/contain, no cropping, no scale
    // math beyond mapping the raster's own pixel grid onto the page's own
    // point grid (both already the same 826x1126 @ 2.75x3.75in @300dpi
    // geometry from print-master-geometry.ts / print-specs.ts).
    page.drawImage(img, { x: 0, y: 0, width, height });
    drawCropMarks(page);
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
