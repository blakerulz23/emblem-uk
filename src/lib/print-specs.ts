/**
 * Print-ready file specifications for each product.
 *
 * All sizes are in inches. Generated PDFs include 0.125" bleed and
 * crop marks. DPI is 300 across the board.
 */

export type ProductKind = 'card' | 'poster-sm' | 'poster-md' | 'poster-lg' | 'sticker' | 'keychain' | 'puzzle';

export interface PrintSpec {
  /** Human label */
  label: string;
  /** Final trimmed size in inches */
  finalWidthIn: number;
  finalHeightIn: number;
  /** Bleed extends beyond final size in inches (each edge) */
  bleedIn: number;
  /** DPI (always 300 for print-ready) */
  dpi: number;
  /** Whether double-sided (cards) */
  pages: 1 | 2;
}

export const PRINT_SPECS: Record<ProductKind, PrintSpec> = {
  card:       { label: 'Trading Card',      finalWidthIn: 2.5,  finalHeightIn: 3.5,  bleedIn: 0.125, dpi: 300, pages: 2 },
  sticker:    { label: 'Sticker',           finalWidthIn: 3,    finalHeightIn: 3,    bleedIn: 0.125, dpi: 300, pages: 1 },
  keychain:   { label: 'Keychain',          finalWidthIn: 2.5,  finalHeightIn: 2.5,  bleedIn: 0.125, dpi: 300, pages: 1 },
  'poster-sm':{ label: 'Poster 11x17',      finalWidthIn: 11,   finalHeightIn: 17,   bleedIn: 0.125, dpi: 300, pages: 1 },
  'poster-md':{ label: 'Poster 18x24',      finalWidthIn: 18,   finalHeightIn: 24,   bleedIn: 0.125, dpi: 300, pages: 1 },
  'poster-lg':{ label: 'Poster 24x36',      finalWidthIn: 24,   finalHeightIn: 36,   bleedIn: 0.125, dpi: 300, pages: 1 },
  puzzle:     { label: 'Puzzle 330x420mm',  finalWidthIn: 12.992, finalHeightIn: 16.535, bleedIn: 0.118, dpi: 300, pages: 1 },
};

/** Pixel dimensions of the design (incl. bleed) at print DPI. */
export function pixelDimensions(spec: PrintSpec): { width: number; height: number } {
  return {
    width: Math.round((spec.finalWidthIn + spec.bleedIn * 2) * spec.dpi),
    height: Math.round((spec.finalHeightIn + spec.bleedIn * 2) * spec.dpi),
  };
}

/** PDF page size in PDF points (1 inch = 72 points). */
export function pdfPageSize(spec: PrintSpec): { width: number; height: number } {
  return {
    width: (spec.finalWidthIn + spec.bleedIn * 2) * 72,
    height: (spec.finalHeightIn + spec.bleedIn * 2) * 72,
  };
}
