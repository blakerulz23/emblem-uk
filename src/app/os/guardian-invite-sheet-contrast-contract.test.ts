import fs from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * The coach's guardian-invite sheet has an always-light surface in both
 * themes. Its outcome text (sent / email not sent), error text and muted
 * actions must each meet WCAG AA (4.5:1) against that surface and against
 * the sheet's white buttons. Contrast is computed from os.css itself and
 * the component's own button background (WCAG 2.x relative luminance).
 */
const css = fs.readFileSync('src/app/os/os.css', 'utf8');
const sheet = fs.readFileSync('src/app/os/overlays/GuardianInviteSheet.tsx', 'utf8');

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: Rgb, b: Rgb) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is defined in os.css`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}
const prop = (selector: string, name: string) => hex(block(selector).match(new RegExp(`(?:^|[\\s;{])${name}:\\s*(#[0-9A-Fa-f]{6})`))![1]);

const surface = prop('.emblem-os .os-light-sheet', 'background');
const buttonSurface = hex(sheet.match(/const sheetButtonStyle[\s\S]*?background:\s*'(#[0-9A-Fa-f]{3,6})'/)![1].replace(/^#fff$/i, '#ffffff'));
const ink = prop('.emblem-os .os-light-sheet', '--os-ink');
const muted = prop('.emblem-os .os-light-sheet', '--os-muted');
const ok = prop('.emblem-os .os-sheet-notice-ok', 'color');
const warn = prop('.emblem-os .os-sheet-notice-warn', 'color');
const error = prop('.emblem-os .os-sheet-notice-error', 'color');

describe('guardian invite sheet — outcome contrast (WCAG AA)', () => {
  it('reads the real surfaces: the always-light sheet and its white buttons', () => {
    expect(surface).toEqual(hex('#F4F2EE'));
    expect(buttonSurface).toEqual(hex('#ffffff'));
  });

  it.each([
    ['sent (success)', () => ok],
    ['email not sent (warning)', () => warn],
    ['copy or send failed (error)', () => error],
    ['muted actions (Done, Cancel, share link)', () => muted],
    ['ink (title, button labels)', () => ink],
  ])('%s is at least 4.5:1 on the sheet and on its buttons', (_label, colour) => {
    expect(contrast(colour(), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour(), buttonSurface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps success and warning distinct: sent is green, not styled as a warning', () => {
    const [r, g] = ok;
    expect(g).toBeGreaterThan(r);
    expect(ok).not.toEqual(warn);
  });

  it('uses the stylesheet classes for every outcome and error message, with no hard-coded text colours', () => {
    expect(sheet).toContain("className={outcome.emailed ? 'os-sheet-notice-ok' : 'os-sheet-notice-warn'}");
    expect(sheet.match(/role="alert" className="os-sheet-notice-error"/g)).toHaveLength(3);
    expect(sheet.match(/role="alert"/g)).toHaveLength(3);
    for (const old of ['#C4501C', '#2E9E5B', '#C0392B', '#8A8378']) expect(sheet).not.toContain(old);
    expect(sheet).toContain('className="os-light-sheet"');
  });

  it('never switches the sheet colours in dark mode (the surface stays light)', () => {
    expect(css).not.toMatch(/\.os-dark\s+\.os-(light-sheet|sheet-notice-\w+|sheet-button)/);
  });

  it('every sheet button has a visible keyboard focus and a visible disabled state', () => {
    const buttons = sheet.match(/<button[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toContain('className="os-sheet-button"');
    expect(block('.emblem-os .os-sheet-button:focus-visible')).toMatch(/outline:\s*2px solid #B34715/);
    expect(contrast(hex('#B34715'), surface)).toBeGreaterThanOrEqual(3); // non-text focus indicator
    expect(block('.emblem-os .os-sheet-button:disabled')).toMatch(/opacity:\s*\.6/);
  });
});
