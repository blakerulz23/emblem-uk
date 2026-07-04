import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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

/** Build a print-ready PDF from a design payload. */
export async function buildPdf(payload: DesignPayload): Promise<Buffer> {
  const spec = PRINT_SPECS[payload.product];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Print: ${spec.label}`);
  pdf.setAuthor('Emblem / Last Shot Cards');
  if (payload.meta?.orderRef) pdf.setSubject(`Order ${payload.meta.orderRef}`);
  if (payload.meta) pdf.setKeywords(Object.entries(payload.meta).map(([k, v]) => `${k}:${v}`));

  const { width, height } = pdfPageSize(spec);

  const addPage = async (imageDataUrl: string) => {
    const page = pdf.addPage([width, height]);
    const { bytes, mime } = await loadImageBytes(imageDataUrl);
    const img = mime.includes('jpeg') || mime.includes('jpg')
      ? await pdf.embedJpg(bytes)
      : await pdf.embedPng(bytes);
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
