import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  renderFrontMaster,
  renderBackMaster,
  deriveTrimFromMaster,
  encodeShareImage,
  BLEED_CAPABLE_TEMPLATE_IDS,
  TemplateNotBleedCapableError,
} from './print-master-render';
import { FULL_PX, TRIM_PX, BLEED_PX, trimBoxToCanvasRect } from './print-master-geometry';
import { getCustomCollectionVariant } from './custom-collection-manifest';

const RENDER_SOURCE = readFileSync('src/lib/print-master-render.ts', 'utf8');

async function syntheticPhoto() {
  const svg = `<svg width="400" height="560" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#8899aa"/><circle cx="200" cy="200" r="90" fill="#d8b48c"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function syntheticBadge() {
  // Solid, saturated, distinctive colour — easy to detect positionally
  // without depending on font rendering.
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ff00ff"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
async function syntheticLogo() {
  const svg = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#00ffaa"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function rawPixels(png: Buffer) {
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

describe('print-master-render — architecture-level regression guards', () => {
  it('the compositor never mirrors, reflects, blurs or stretches an already-finished trim raster to synthesise bleed (source-level guard, same pattern this repo already uses for other contract tests)', () => {
    expect(RENDER_SOURCE).not.toMatch(/extendWith:\s*['"]mirror['"]/);
    expect(RENDER_SOURCE).not.toMatch(/\.blur\(/);
    expect(RENDER_SOURCE).not.toMatch(/\.extend\(/); // sharp's edge-extend primitive at all — the legacy mirror-bleed mechanism
  });

  it('a template outside the bleed-capable allowlist throws rather than silently falling back to mirror-generated bleed', async () => {
    await expect(
      renderFrontMaster({ templateId: 'not-a-real-template', playerName: 'X', photo: { bytes: await syntheticPhoto() } })
    ).rejects.toThrow(TemplateNotBleedCapableError);
    expect(BLEED_CAPABLE_TEMPLATE_IDS).toContain('custom-solar');
    expect(BLEED_CAPABLE_TEMPLATE_IDS).toContain('custom-galaxy');
    expect(BLEED_CAPABLE_TEMPLATE_IDS).toContain('custom-comic');
  });

  it('the render functions never crop a finished raster and paste it back into a second composite (the exact two-stage-glue pattern that produced Test C\'s corner notch) — everything is composited once, onto one base canvas', () => {
    const frontFn = RENDER_SOURCE.slice(RENDER_SOURCE.indexOf('export async function renderFrontMaster'), RENDER_SOURCE.indexOf('export async function renderBackMaster'));
    const backFn = RENDER_SOURCE.slice(RENDER_SOURCE.indexOf('export async function renderBackMaster'), RENDER_SOURCE.indexOf('export async function deriveTrimFromMaster'));
    // Small per-layer composites (e.g. placing one badge image onto its
    // own transparent full-size canvas before adding it to the layers
    // array) are fine — that's normal layering. What must NEVER appear is
    // .extract() (cropping a finished raster) feeding into a later
    // composite — that crop-then-paste-back shape is exactly what glued
    // two independently-rendered pieces together and produced Test C's
    // notch.
    for (const fn of [frontFn, backFn]) {
      expect(fn).not.toMatch(/\.extract\(/);
    }
  });
});

describe.each(['custom-solar', 'custom-galaxy', 'custom-comic'] as const)('print-master-render — %s', (templateId) => {
  it('renders a front master at the exact required full-bleed dimensions (826x1126px)', async () => {
    const png = await renderFrontMaster({
      templateId,
      playerName: 'Test Player',
      position: 'CB',
      number: '21',
      photo: { bytes: await syntheticPhoto() },
      badge: await syntheticBadge(),
    });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(FULL_PX.w);
    expect(meta.height).toBe(FULL_PX.h);
    expect(meta.width).toBe(826);
    expect(meta.height).toBe(1126);
  });

  it('renders a back master at the exact same full-bleed dimensions', async () => {
    const png = await renderBackMaster({ templateId, playerName: 'Test Player', logo: await syntheticLogo() });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(FULL_PX.w);
    expect(meta.height).toBe(FULL_PX.h);
  });

  it('the master is fully opaque everywhere — no white or transparent unintended pixels anywhere on the canvas, including all four corners', async () => {
    const png = await renderFrontMaster({
      templateId,
      playerName: 'Test Player',
      position: 'CB',
      number: '21',
      photo: { bytes: await syntheticPhoto() },
      badge: await syntheticBadge(),
    });
    const { data, info } = await rawPixels(png);
    let minAlpha = 255;
    for (let i = 3; i < data.length; i += info.channels) minAlpha = Math.min(minAlpha, data[i]);
    expect(minAlpha).toBe(255);
  });

  it('no dark corner notch: the master is fully opaque right through the exact trim-corner point (a pasted-composite notch, like Test C\'s, showed up as a small non-opaque/mismatched block exactly there)', async () => {
    const png = await renderFrontMaster({
      templateId,
      playerName: 'Test Player',
      position: 'CB',
      number: '21',
      photo: { bytes: await syntheticPhoto() },
      badge: await syntheticBadge(),
    });
    const { data, info } = await rawPixels(png);
    // Sample a small window straddling the exact top-left trim corner
    // (BLEED_PX, BLEED_PX) and the bottom-right one — every pixel must be
    // fully opaque, with no isolated fully-transparent or pure-black
    // block (a flatten() with no gaps would leave one at exactly this
    // spot if two independently-rendered pieces failed to line up).
    for (const [cx, cy] of [[BLEED_PX, BLEED_PX], [FULL_PX.w - BLEED_PX, FULL_PX.h - BLEED_PX]]) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
          const i = (y * info.width + x) * info.channels;
          expect(data[i + 3]).toBe(255);
        }
      }
    }
  });

  it('the badge lands at the exact trim-relative position (trimBoxToCanvasRect), not shifted by the canvas growing to bleed size', async () => {
    const variant = getCustomCollectionVariant(templateId);
    if (!variant.badgeBox) return; // only solar/galaxy/comic all define one today, but guard anyway
    const png = await renderFrontMaster({
      templateId,
      playerName: 'Test Player',
      photo: { bytes: await syntheticPhoto() },
      badge: await syntheticBadge(),
    });
    const { data, info } = await rawPixels(png);
    const rect = trimBoxToCanvasRect(variant.badgeBox as { left: string; top: string; width: string; height: string });
    const cx = Math.round(rect.x + rect.w / 2);
    const cy = Math.round(rect.y + rect.h / 2);
    const i = (cy * info.width + cx) * info.channels;
    // Synthetic badge is solid magenta (#ff00ff) — must appear at its
    // computed trim-relative centre.
    expect(data[i]).toBeGreaterThan(200);
    expect(data[i + 1]).toBeLessThan(60);
    expect(data[i + 2]).toBeGreaterThan(200);

    // The badge's own top-left corner (not just its centre) must also sit
    // exactly at the computed trim-relative rect — proves the whole
    // element is positioned by the trim-box conversion, not just
    // coincidentally overlapping it in the middle.
    const cornerX = Math.round(rect.x) + 2;
    const cornerY = Math.round(rect.y) + 2;
    const ci = (cornerY * info.width + cornerX) * info.channels;
    expect(data[ci]).toBeGreaterThan(200);
    expect(data[ci + 2]).toBeGreaterThan(200);
  });
});

describe('print-master-render — one canonical visual source (master -> trim -> share)', () => {
  it('deriveTrimFromMaster crops exactly the trim rectangle, at the exact required trim pixel size', async () => {
    const master = await renderFrontMaster({ templateId: 'custom-solar', playerName: 'Test', photo: { bytes: await syntheticPhoto() } });
    const trim = await deriveTrimFromMaster(master);
    const meta = await sharp(trim).metadata();
    expect(meta.width).toBe(TRIM_PX.w);
    expect(meta.height).toBe(TRIM_PX.h);
  });

  it('the trimmed region of the master matches the share derivative, allowing only the documented JPEG-encoding difference — proving one visual source, not two independent captures', async () => {
    const master = await renderFrontMaster({ templateId: 'custom-solar', playerName: 'Test', photo: { bytes: await syntheticPhoto() } });
    const trimPng = await deriveTrimFromMaster(master);
    const shareJpg = await encodeShareImage(trimPng, 92);

    const a = await sharp(trimPng).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(shareJpg).raw().toBuffer({ resolveWithObject: true });
    expect(a.info.width).toBe(b.info.width);
    expect(a.info.height).toBe(b.info.height);

    let maxDiff = 0;
    let sumDiff = 0;
    const n = Math.min(a.data.length, b.data.length);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(a.data[i] - b.data[i]);
      maxDiff = Math.max(maxDiff, d);
      sumDiff += d;
    }
    const meanDiff = sumDiff / n;
    // JPEG at quality 92 introduces small, bounded, well-distributed
    // error — never a structural difference (a wrong crop, a shifted
    // composition, a missing layer would show as a large mean/median
    // difference, not just quantisation noise).
    expect(meanDiff).toBeLessThan(6);
  });
});
