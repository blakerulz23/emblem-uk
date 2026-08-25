'use client';

import html2canvas from 'html2canvas';

/**
 * Guardian-controlled card-front social sharing — every function here
 * operates entirely in browser memory. Nothing in this module uploads,
 * fetches from, or writes to any remote storage; the only network call
 * anywhere in this feature is the consent RPC (see ShareCardSheet.tsx),
 * which never receives the image itself. Object URLs created here are
 * always revoked by the caller once sharing/downloading finishes — see
 * ShareCardSheet.tsx's cleanup.
 */

export const SOCIAL_SHARE_FILENAME = 'emblem-card.png';

const SOCIAL_IMAGE_WIDTH = 1080;
const SOCIAL_IMAGE_HEIGHT = 1350;
const SOCIAL_BACKGROUND = '#0b0f14';
const SOCIAL_ACCENT = '#7dd8c6';

export interface SocialImageBrand {
  /** Canonical builder domain shown outside the card — never a per-order URL. */
  domain: string;
}

/**
 * Captures a single, already-rendered card-FRONT DOM node (the exact
 * on-screen approved preview — see PlayerCard in ProductionBuilder.tsx,
 * rendered without forPrint) and composes it, unaltered except for
 * proportional scaling, onto a fixed-size social image with Emblem
 * marketing content placed only outside the card's own bounds. Reuses the
 * same html2canvas capture this codebase already uses for print
 * (print-capture.ts's captureElementToPng) — same library, same DOM-to-
 * canvas mechanism, never the print pipeline itself.
 */
export async function buildSocialShareImage(cardFrontEl: HTMLElement, brand: SocialImageBrand): Promise<Blob> {
  const cardCanvas = await html2canvas(cardFrontEl, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    logging: false,
  });

  const out = document.createElement('canvas');
  out.width = SOCIAL_IMAGE_WIDTH;
  out.height = SOCIAL_IMAGE_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');

  ctx.fillStyle = SOCIAL_BACKGROUND;
  ctx.fillRect(0, 0, SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT);

  // The card is centred within a fixed margin, scaled proportionally to
  // fit — its own composition (photo crop, text, badge, layout, colours)
  // is never altered, only resized as a whole.
  const marginX = 90;
  const topMargin = 170;
  const bottomMargin = 230;
  const maxW = SOCIAL_IMAGE_WIDTH - marginX * 2;
  const maxH = SOCIAL_IMAGE_HEIGHT - topMargin - bottomMargin;
  const cardScale = Math.min(maxW / cardCanvas.width, maxH / cardCanvas.height);
  const drawW = cardCanvas.width * cardScale;
  const drawH = cardCanvas.height * cardScale;
  const drawX = (SOCIAL_IMAGE_WIDTH - drawW) / 2;
  const drawY = topMargin + (maxH - drawH) / 2;

  // A soft shadow behind the card only — never drawn over the card face
  // itself.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = 'rgba(0,0,0,0.001)';
  ctx.fillRect(drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.drawImage(cardCanvas, drawX, drawY, drawW, drawH);

  // Marketing content — entirely outside the card's own bounds.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 34px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Made with Emblem', SOCIAL_IMAGE_WIDTH / 2, 90);

  ctx.fillStyle = SOCIAL_ACCENT;
  ctx.font = '700 40px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Create yours at Emblem', SOCIAL_IMAGE_WIDTH / 2, SOCIAL_IMAGE_HEIGHT - 140);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '400 28px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(brand.domain, SOCIAL_IMAGE_WIDTH / 2, SOCIAL_IMAGE_HEIGHT - 90);

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not export image'));
      },
      'image/png'
    );
  });
}

export type ShareOutcome = { kind: 'shared' } | { kind: 'cancelled' } | { kind: 'downloaded' } | { kind: 'unsupported' };

/**
 * Uses the Web Share API with a File when the browser supports sharing
 * files, otherwise falls back to a plain local download. A user cancelling
 * the native share sheet is a normal, silent outcome (AbortError) — never
 * surfaced as an error. Any other failure is reported generically; the
 * underlying error is never logged (it could theoretically echo back
 * something derived from the image).
 */
export async function shareOrDownloadSocialImage(blob: Blob, title: string): Promise<ShareOutcome> {
  const file = new File([blob], SOCIAL_SHARE_FILENAME, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && 'share' in navigator && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return { kind: 'shared' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { kind: 'cancelled' };
      }
      throw err;
    }
  }

  downloadBlob(blob);
  return { kind: 'downloaded' };
}

/** Calls /api/card-share/consent — the only network request this feature
 *  ever makes. Never sends the image, the child's name, or any card
 *  content; only the order id and the two confirmation booleans. */
export async function recordCardShareConsent(args: {
  orderId: string;
  confirmedAuthority: boolean;
  confirmedRecallUnderstanding: boolean;
  consentWordingVersion: string;
}): Promise<{ ok: boolean }> {
  const res = await fetch('/api/card-share/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: args.orderId,
      confirmedAuthority: args.confirmedAuthority,
      confirmedRecallUnderstanding: args.confirmedRecallUnderstanding,
      consentWordingVersion: args.consentWordingVersion,
    }),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean };
  return { ok: data.ok === true };
}

export function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = SOCIAL_SHARE_FILENAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
