import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Locks in the Hollinwood name/position typography fix: the fit-scale
 * calibration measured against the supplied Canva reference PNGs
 * (Hollinwood (80).png / (81).png, alpha-bounds matched on a 1050x1498
 * canvas — see the PR description for the full measurement), and that the
 * fix stays scoped to HollinwoodCardArt without leaking into EmjflCardArt,
 * which intentionally keeps its own, unrelated coordinates/font.
 *
 * CardArt.tsx is a .tsx file and this project's vitest config has no JSX/
 * React transform (confirmed: no existing test imports any .tsx component),
 * so this can't import and execute nameFitScale directly. Instead it
 * mirrors nameFitScale's own well-established formula (unchanged since
 * PR #85: `length <= comfortableChars ? 1 : max(minScale, comfortableChars
 * / length)`) inline and asserts both against that formula and against the
 * literal source text, so a change to either the formula or the calibration
 * constants at the Hollinwood call sites fails this test.
 */

function nameFitScale(name: string | undefined, comfortableChars: number, minScale: number): number {
  const length = (name || '').trim().length;
  if (length <= comfortableChars) return 1;
  return Math.max(minScale, comfortableChars / length);
}

describe('Hollinwood name fit-scale (comfortableChars=14, minScale=0.6)', () => {
  it('renders the reference name "JACOB THOMPSON" (14 chars) at full scale', () => {
    expect(nameFitScale('JACOB THOMPSON', 14, 0.6)).toBe(1);
  });

  it('renders a short name at full scale', () => {
    expect(nameFitScale('LI YU', 14, 0.6)).toBe(1);
  });

  it('scales down a longer name proportionally, above the floor', () => {
    const longer = 'CHRISTOPHER ALLEN'; // 17 chars
    expect(longer.length).toBe(17);
    expect(nameFitScale(longer, 14, 0.6)).toBeCloseTo(14 / 17, 5);
  });

  it('clamps at the 0.6 floor for an extreme-length name rather than shrinking further', () => {
    const extreme = 'CHRISTOPHER ALEXANDER-WOJCIECHOWSKI'; // 36 chars, 14/36 < 0.6
    expect(nameFitScale(extreme, 14, 0.6)).toBe(0.6);
  });
});

describe('Hollinwood position fit-scale (comfortableChars=10, minScale=0.85)', () => {
  it.each(['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'])(
    'renders canonical label %s at full scale',
    (label) => {
      expect(nameFitScale(label, 10, 0.85)).toBe(1);
    }
  );

  it('scales down ALL-ROUNDER (11 chars) just enough to stay proportional, not clamped', () => {
    expect(nameFitScale('ALL-ROUNDER', 10, 0.85)).toBeCloseTo(10 / 11, 5);
    expect(nameFitScale('ALL-ROUNDER', 10, 0.85)).toBeGreaterThan(0.85);
  });

  it('renders a short legacy position value (e.g. "CB") at full scale', () => {
    expect(nameFitScale('CB', 10, 0.85)).toBe(1);
  });
});

describe('the calibration formula above matches CardArt.tsx exactly, and stays scoped to Hollinwood', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/builder/emblem/CardArt.tsx'),
    'utf8'
  );

  function bodyOf(fnName: string): string {
    const start = source.indexOf(`function ${fnName}(`);
    expect(start, `${fnName} not found in CardArt.tsx`).toBeGreaterThan(-1);
    const nextFn = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, nextFn === -1 ? undefined : nextFn);
  }

  it('nameFitScale itself is still exactly the formula this test mirrors', () => {
    expect(source).toContain(
      'function nameFitScale(name: string | undefined, comfortableChars = 10, minScale = 0.68)'
    );
    expect(source).toContain('if (length <= comfortableChars) return 1;');
    expect(source).toContain('return Math.max(minScale, comfortableChars / length);');
  });

  it('HollinwoodCardArt uses the real Antonio font and the measured calibration', () => {
    const body = bodyOf('HollinwoodCardArt');
    // The jersey-number div legitimately keeps var(--font-oswald) — this
    // fix is scoped to the name/position divs only, so assert the name div
    // specifically switched fonts rather than banning oswald from the whole
    // function body.
    const nameDivStart = body.indexOf("{d.name || 'Player Name'}");
    const nameDivOpenTag = body.lastIndexOf('<div', nameDivStart);
    const nameDivStyleBlock = body.slice(nameDivOpenTag, nameDivStart);
    expect(nameDivStyleBlock).toContain('var(--font-antonio)');
    expect(nameDivStyleBlock).not.toContain('var(--font-oswald)');
    expect(body).toContain('nameFitScale(d.name || \'\', 14, 0.6)');
    expect(body).toContain('nameFitScale(positionLabel, 10, 0.85)');
    // Measured anchors (native-1050 %) — bottom-left of each rotated text's
    // on-screen box, matched to the reference PNGs' own alpha bounds.
    expect(body).toContain("left: '9.08%', top: '62.73%'");
    expect(body).toContain("left: '17.57%', top: '52.84%'");
  });

  it('EmjflCardArt is untouched — still on its own font and coordinates', () => {
    const body = bodyOf('EmjflCardArt');
    expect(body).toContain('var(--font-oswald)');
    expect(body).not.toContain('var(--font-antonio)');
    // The pre-fix coordinates HollinwoodCardArt used to share with EMJFL —
    // confirms this fix did not also change EMJFL's own values.
    expect(body).toContain("left: '10.1%', top: '66.8%'");
    expect(body).toContain("left: '18.3%', top: '58.9%'");
  });

  it('other card families (Custom Collection, and the generic RealCardArt renderer shared by Futuristic/Chrome/Galaxy/Vintage/Champions) are untouched by this change', () => {
    for (const fnName of ['CustomCollectionCardArt', 'RealCardArt']) {
      const body = bodyOf(fnName);
      expect(body).not.toContain('var(--font-antonio)');
    }
  });

  it('PR #81 photo geometry and PR #85 canonical position resolution are still called by HollinwoodCardArt, untouched', () => {
    const body = bodyOf('HollinwoodCardArt');
    expect(body).toContain('computePhotoGeometry(');
    expect(body).toContain("positionCardLabel(d.position, 'POSITION')");
  });
});

describe('print-capture.ts font-load-readiness stays additive to PR #78\'s object-fit fix', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/lib/print-capture.ts'), 'utf8');

  it('awaits document.fonts.ready before the object-fit neutralisation call', () => {
    const fontsIdx = source.indexOf('document.fonts.ready');
    const neutralizeIdx = source.indexOf('neutralizeObjectFitCoverForCapture(el)');
    expect(fontsIdx).toBeGreaterThan(-1);
    expect(neutralizeIdx).toBeGreaterThan(-1);
    expect(fontsIdx).toBeLessThan(neutralizeIdx);
  });

  it('is guarded for the case document.fonts is unavailable (SSR-safety)', () => {
    expect(source).toContain("typeof document !== 'undefined' && document.fonts");
  });
});
