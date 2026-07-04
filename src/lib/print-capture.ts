'use client';

import html2canvas from 'html2canvas';

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
  backImageDataUrl?: string
): Promise<RenderPrintResponse> {
  const r = await fetch('/api/render-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product, frontImageDataUrl, backImageDataUrl, meta }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'render failed' }));
    throw new Error(err.error || 'render failed');
  }
  return r.json();
}
