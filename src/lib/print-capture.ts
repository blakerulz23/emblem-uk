'use client';

import html2canvas from 'html2canvas';

/**
 * emblem_builder_csrf is deliberately non-httpOnly (see
 * src/lib/builder-request-security.ts and src/middleware.ts's
 * ensureBuilderCsrfCookie) specifically so client code can echo it back as
 * a header — the same double-submit-cookie pattern Squad Invite's own
 * readSquadInviteCsrfCookie (ProductionBuilder.tsx) uses. Shared here
 * because both ProductionBuilder.tsx and the test-print dev harness call
 * into this module.
 */
export const BUILDER_CSRF_HEADER = 'x-emblem-builder-csrf';

export function readBuilderCsrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )emblem_builder_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export interface CaptureOptions {
  pixelRatio?: number;
  quality?: number;
  backgroundColor?: string;
}

export async function captureElementToPng(
  el: HTMLElement,
  opts: CaptureOptions = {}
): Promise<string> {
  const canvas = await html2canvas(el, {
    scale: opts.pixelRatio ?? 1.5,
    useCORS: true,
    allowTaint: false,
    backgroundColor: opts.backgroundColor ?? null,
    logging: false,
  });
  return canvas.toDataURL('image/jpeg', opts.quality ?? 0.88);
}

export type PrintProduct = 'card' | 'sticker' | 'keychain' | 'poster-sm' | 'poster-md' | 'poster-lg' | 'puzzle';

export interface RenderPrintResponse {
  success: boolean;
  key: string;
  downloadUrl: string;
  bytes: number;
  spec: { label: string; finalWidthIn: number; finalHeightIn: number; bleedIn: number; dpi: number; pages: number };
}

export async function renderPrintFile(
  product: PrintProduct,
  frontImageDataUrl: string,
  meta?: { playerName?: string; teamName?: string; template?: string; orderRef?: string },
  backImageDataUrl?: string,
  /** Optional here only for parameter-ordering reasons (it must follow
   *  the already-optional meta/backImageDataUrl) — /api/render-print
   *  itself now rejects any call that omits it. Namespaces the print-file
   *  key by order-enquiry-validation.ts's expected
   *  print-files/<submissionKey>/ prefix. A real order submission uses
   *  ProductionBuilder.tsx's own crypto.randomUUID(); src/app/test-print
   *  generates its own dev-only key for the same reason. */
  submissionKey?: string
): Promise<RenderPrintResponse> {
  const r = await fetch('/api/render-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [BUILDER_CSRF_HEADER]: readBuilderCsrfCookie() },
    body: JSON.stringify({ product, frontImageDataUrl, backImageDataUrl, meta, submissionKey }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'render failed' }));
    throw new Error(err.error || 'render failed');
  }
  return r.json();
}
