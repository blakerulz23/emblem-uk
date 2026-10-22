import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// Print and share images are captured with html2canvas (print-capture.ts).
// html2canvas measures font baselines with a hidden 1x1 <img> inside a
// hidden, no-wrap <div> appended to <body>. Tailwind's base reset makes every
// img display:block, which pushed every captured line of text down by roughly
// the font's descent (doc 33). globals.css puts that one probe image back
// inline. These tests keep the CSS rule and the library's probe in step.

const RULE_SELECTOR = 'body > div[style*="visibility: hidden"][style*="white-space: nowrap"] > img';

const globalsCss = readFileSync('src/app/globals.css', 'utf8');

describe('globals.css: html2canvas baseline probe fix', () => {
  it('puts the probe image back inline, overriding the Tailwind img reset', () => {
    const start = globalsCss.indexOf(RULE_SELECTOR);
    expect(start).toBeGreaterThan(-1);
    const block = globalsCss.slice(start, globalsCss.indexOf('}', start) + 1);
    expect(block).toContain('display: inline !important');
  });

  it('comes after the Tailwind base layer it overrides', () => {
    expect(globalsCss.indexOf(RULE_SELECTOR)).toBeGreaterThan(globalsCss.indexOf('@tailwind base;'));
  });
});

describe('html2canvas: baseline probe still matches the selector', () => {
  const pkg = JSON.parse(readFileSync('node_modules/html2canvas/package.json', 'utf8')) as { version: string };

  it('is the version the fix was measured against (1.4.1)', () => {
    // A different version may build its probe differently; re-measure the
    // print offset (doc 33 method) before changing this expectation.
    expect(pkg.version).toBe('1.4.1');
  });

  for (const file of ['node_modules/html2canvas/dist/html2canvas.js', 'node_modules/html2canvas/dist/html2canvas.esm.js']) {
    it(`${file.split('/').pop()}: probe is a hidden, no-wrap div on <body> holding the 1x1 image`, () => {
      const source = readFileSync(file, 'utf8');
      const start = source.indexOf('FontMetrics.prototype.parseMetrics');
      expect(start).toBeGreaterThan(-1);
      const probe = source.slice(start, source.indexOf('FontMetrics.prototype.getMetrics', start));
      expect(probe).toContain("container.style.visibility = 'hidden'");
      expect(probe).toContain("container.style.whiteSpace = 'nowrap'");
      expect(probe).toContain('body.appendChild(container)');
      expect(probe).toContain('container.appendChild(img)');
      expect(probe).toContain("img.style.verticalAlign = 'baseline'");
    });
  }
});
