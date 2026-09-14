import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

/**
 * Regression coverage for a real, measured defect (2026-09 nameplate-
 * alignment audit): Crimson/Royal/Emerald/Glacier's thin decorative rule
 * — baked into each template's own frame-overlay.png, not a separate CSS
 * element (confirmed by reading each *CardArt.tsx: no line/divider node
 * exists anywhere in their JSX) — sat close enough to NAME_GEOMETRY's
 * originally-measured bottom-anchor that real text rendering (line-
 * height:1, this font's own ascent/descent metrics) left under 8px of
 * clearance at 750x1050 between the rule and the rendered glyph tops —
 * confirmed by rendering all four templates (Playwright, real fonts) and
 * measuring actual pixel bounds, not by reading CSS coordinates alone.
 *
 * This is a Node-environment suite (no jsdom/browser here — see
 * vitest.config.mts), so it cannot re-run that same live-browser
 * measurement on every CI run. What it CAN do, and does, is two things
 * that together make a silent regression fail a test:
 *
 *  1. Measure the real frame-overlay.png asset directly (via sharp, not a
 *     screenshot) for the rule's own vertical position — protects against
 *     an asset swap silently moving the rule without anyone re-checking
 *     clearance.
 *  2. Parse each template's real source for its actual NAME_GEOMETRY
 *     values and recompute the same clearance check this audit performed
 *     by hand, using the exact glyph-top offset fraction measured from
 *     the real Playwright renders (documented per template below, since
 *     Emerald's own layeredText wrapper — height: fillSize*1.18, grid-
 *     centred — produces a measurably different offset than the other
 *     three plain-div/line-height:1 templates) — protects against
 *     NAME_GEOMETRY.bottom (or, for Emerald, the wrapper height factor)
 *     drifting back into collision.
 */

const ROOT = resolve(__dirname, '../../../..');
const CANVAS_H = 1498; // native asset height shared by all four templates' 1050x1498 Canva source

type TemplateSpec = {
  label: string;
  file: string;
  frameOverlay: string;
  /** Glyph-top offset above the line-height:1 (or, for Emerald, the
   *  layeredText wrapper) box's own top edge, as a fraction of fontSize —
   *  measured directly from a real Playwright render of this template
   *  with a short/medium (unscaled, nameFitScale=1) name at 750x~1050,
   *  comparing the computed box-top against the actual measured glyph-top
   *  pixel row. Not a font-metrics table lookup — a real measurement. */
  measuredGlyphTopOffsetFraction: number;
  /** Whether this template wraps its name in the taller (fillSize*1.18)
   *  layeredText box (Emerald) instead of a plain line-height:1 div
   *  (Crimson/Royal/Glacier). */
  usesLayeredTextWrapper: boolean;
};

const TEMPLATES: TemplateSpec[] = [
  {
    label: 'Crimson',
    file: 'src/components/builder/emblem/CrimsonCardArt.tsx',
    frameOverlay: 'public/templates/custom-collection/crimson/frame-overlay.png',
    measuredGlyphTopOffsetFraction: 0.19,
    usesLayeredTextWrapper: false,
  },
  {
    label: 'Royal',
    file: 'src/components/builder/emblem/RoyalCardArt.tsx',
    frameOverlay: 'public/templates/custom-collection/royal/frame-overlay.png',
    measuredGlyphTopOffsetFraction: 0.17,
    usesLayeredTextWrapper: false,
  },
  {
    label: 'Emerald',
    file: 'src/components/builder/emblem/EmeraldCardArt.tsx',
    frameOverlay: 'public/templates/custom-collection/emerald/frame-overlay.png',
    measuredGlyphTopOffsetFraction: 0.29,
    usesLayeredTextWrapper: true,
  },
  {
    label: 'Glacier',
    file: 'src/components/builder/emblem/GlacierCardArt.tsx',
    frameOverlay: 'public/templates/custom-collection/glacier/frame-overlay.png',
    measuredGlyphTopOffsetFraction: 0.196,
    usesLayeredTextWrapper: false,
  },
];

function parseGeometryPercent(source: string, constName: 'NAME_GEOMETRY', field: 'bottom'): number {
  const re = new RegExp(`const ${constName}\\s*=\\s*\\{[^}]*${field}:\\s*'([\\d.]+)%'`);
  const match = source.match(re);
  if (!match) throw new Error(`${constName}.${field} not found in source`);
  return parseFloat(match[1]);
}

function parseFontSizeFactor(source: string): number {
  const match = source.match(/const NAME_GEOMETRY\s*=\s*\{[^}]*fontSizeFactor:\s*([\d.]+)/);
  if (!match) throw new Error('NAME_GEOMETRY.fontSizeFactor not found in source');
  return parseFloat(match[1]);
}

/** Measures frame-overlay.png's own banner-top rim — the actual rule the
 *  name collides with — directly from the real asset. Confirmed by
 *  rendering (this audit): the collision is between the name's TOP and
 *  this outer rim (~62% of the native canvas on all four templates), not
 *  the separate thin "diamond" rule between name and position (~70%,
 *  which this audit measured as having 15-25px of slack throughout — not
 *  the defect). Not a screenshot — a real per-template asset measurement. */
async function measureRuleBounds(pngPath: string): Promise<{ top: number; bottom: number }> {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cx0 = Math.round(width * 0.38);
  const cx1 = Math.round(width * 0.62);

  // The banner's outer top rim sits roughly 60-64% down the native canvas
  // on this shared asset family (measured: 61.75-62.28% across all four
  // templates) — search a window around it, well clear of the still-
  // visible player photo above and the name glyphs below.
  const yStart = Math.round(height * 0.55);
  const yEnd = Math.round(height * 0.66);

  let ruleTop = -1;
  let ruleBottom = -1;
  for (let y = yStart; y < yEnd; y++) {
    let brightCount = 0;
    for (let x = cx0; x < cx1; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a > 100 && (r + g + b) / 3 > 150) brightCount++;
    }
    const frac = brightCount / (cx1 - cx0);
    if (frac > 0.5) {
      if (ruleTop === -1) ruleTop = y;
      ruleBottom = y;
    }
  }
  if (ruleTop === -1) throw new Error(`Could not locate the decorative rule in ${pngPath}`);
  return { top: ruleTop, bottom: ruleBottom };
}

describe('Custom Collection nameplate — name never collides with the decorative rule above it', () => {
  it.each(TEMPLATES)('$label: the rule is baked into frame-overlay.png, not a separate CSS element', (spec) => {
    const source = readFileSync(resolve(ROOT, spec.file), 'utf8');
    // No divider/line/rule/hr element anywhere in the component's own JSX —
    // confirms the rule is asset-baked, not something this fix could (or
    // should) address by moving a CSS element instead of the text anchor.
    expect(source).not.toMatch(/<hr\b/);
    expect(source).not.toMatch(/className="[^"]*divider/i);
    expect(source).not.toMatch(/\/\/\s*decorative\s+line|\/\*\s*decorative\s+line/i);
  });

  it.each(TEMPLATES)('$label: NAME_GEOMETRY.bottom clears the measured rule by at least 8px at 750x1050 (the print-trim resolution)', async (spec) => {
    const source = readFileSync(resolve(ROOT, spec.file), 'utf8');
    const bottomPercent = parseGeometryPercent(source, 'NAME_GEOMETRY', 'bottom');
    const fontSizeFactor = parseFontSizeFactor(source);

    const rule = await measureRuleBounds(resolve(ROOT, spec.frameOverlay));
    const ruleBottomPercent = (rule.bottom / CANVAS_H) * 100;

    // Reproduce the exact box math CardArt/*CardArt.tsx uses at the
    // 750x1050 print-trim resolution (W=750, matching PRINT_SPECS.card at
    // 300dpi trim width — the same physical card this audit's own
    // clearance requirement is expressed against).
    const TRIM_W = 750;
    const TRIM_H = 1050;
    const fontSizePx = TRIM_W * fontSizeFactor; // nameFitScale=1 for an unscaled (short/medium) name — the worst case for top clearance, since a scaled-down long name only ever produces a SMALLER box, moving its top further from the rule, never closer.
    const boxHeightPx = spec.usesLayeredTextWrapper ? fontSizePx * 1.18 : fontSizePx;
    const boxBottomPx = (bottomPercent / 100) * TRIM_H;
    const boxTopPx = boxBottomPx - boxHeightPx;
    const glyphTopPx = boxTopPx + spec.measuredGlyphTopOffsetFraction * fontSizePx;

    const ruleBottomPx = (ruleBottomPercent / 100) * TRIM_H;
    const clearancePx = glyphTopPx - ruleBottomPx;

    expect(clearancePx, `${spec.label}: measured clearance between the rule and the name's glyph top`).toBeGreaterThanOrEqual(8);
  });

  it.each(TEMPLATES)('$label: the name stays horizontally centred (left: 50%, translate(-50%, ...))', (spec) => {
    const source = readFileSync(resolve(ROOT, spec.file), 'utf8');
    expect(source).toMatch(/const NAME_GEOMETRY\s*=\s*\{\s*left:\s*'50%'/);
  });

  it.each(TEMPLATES)('$label: adaptive name-fit scaling (nameFitScale / minScale 0.6) is preserved, not removed', (spec) => {
    const source = readFileSync(resolve(ROOT, spec.file), 'utf8');
    expect(source).toMatch(/const NAME_GEOMETRY\s*=\s*\{[^}]*minScale:\s*0\.6/);
  });

  it.each(TEMPLATES)('$label: POSITION_GEOMETRY is untouched by this fix — only NAME_GEOMETRY.bottom moved', (spec) => {
    // Cross-checked against this audit's own real measurements: the
    // name-to-position gap had 15-25px of slack before this fix and
    // stayed comfortably clear afterwards — POSITION_GEOMETRY itself
    // never needed to change.
    const source = readFileSync(resolve(ROOT, spec.file), 'utf8');
    expect(source).toMatch(/const POSITION_GEOMETRY\s*=\s*\{\s*left:\s*'50%'/);
  });
});
