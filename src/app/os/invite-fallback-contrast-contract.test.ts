import fs from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * The "Copy invitation link" fallback on Profile (shown when an invitation
 * email could not be sent) must stay readable and operable in both themes.
 * Contrast is computed from os.css itself (WCAG 2.x relative luminance).
 */
const css = fs.readFileSync('src/app/os/os.css', 'utf8');
const profile = fs.readFileSync('src/app/os/screens/Profile.tsx', 'utf8');

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: Rgb, b: Rgb) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha))) as Rgb;

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is defined`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}
const token = (theme: string, name: string) => hex(block(theme).match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))![1]);
const rgba = (decl: string): [Rgb, number] => {
  const m = decl.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([.\d]+)\)/)!;
  return [[+m[1], +m[2], +m[3]], +m[4]];
};
const colour = (selector: string) => hex(block(selector).match(/color:\s*(#[0-9A-Fa-f]{6})/)![1]);

const lightCard = token('.emblem-os', '--os-card');
const darkCard = token('.emblem-os.os-dark', '--os-card');
const lightInk = token('.emblem-os', '--os-ink');
const darkInk = token('.emblem-os.os-dark', '--os-ink');

describe('Profile invitation-link fallback', () => {
  it('uses the themed secondary button, not a hard-coded light surface', () => {
    const button = profile.slice(profile.indexOf('className="os-secondary-button"') - 200, profile.indexOf('className="os-secondary-button"') + 400);
    expect(button).toContain('type="button"');
    expect(button).toContain("disabled={inviteLinkCopy === 'copying'}");
    expect(button).not.toMatch(/background:\s*'#fff'/);
  });

  it('button text and border meet WCAG contrast on both card colours', () => {
    const base = block('.emblem-os .os-secondary-button');
    expect(base).toMatch(/background:\s*var\(--os-card\)/);
    expect(base).toMatch(/color:\s*var\(--os-ink\)/);
    expect(contrast(lightInk, lightCard)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkInk, darkCard)).toBeGreaterThanOrEqual(4.5);
    const [lb, la] = rgba(base.match(/border:[^;]*/)![0]);
    expect(contrast(over(lb, la, lightCard), lightCard)).toBeGreaterThanOrEqual(3);
    const [db, da] = rgba(block('.emblem-os.os-dark .os-secondary-button').match(/border-color:[^;]*/)![0]);
    expect(contrast(over(db, da, darkCard), darkCard)).toBeGreaterThanOrEqual(3);
  });

  it('has a 44px touch target, a visible focus ring in both themes and a distinct disabled state', () => {
    expect(Number(block('.emblem-os .os-secondary-button').match(/min-height:\s*(\d+)px/)![1])).toBeGreaterThanOrEqual(44);
    const lightRing = hex(block('.emblem-os .os-secondary-button:focus-visible').match(/outline:\s*2px solid (#[0-9A-Fa-f]{6})/)![1]);
    const darkRing = hex(block('.emblem-os.os-dark .os-secondary-button:focus-visible').match(/outline-color:\s*(#[0-9A-Fa-f]{6})/)![1]);
    expect(contrast(lightRing, lightCard)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkRing, darkCard)).toBeGreaterThanOrEqual(3);
    expect(block('.emblem-os .os-secondary-button:disabled')).toMatch(/opacity:\s*\.6/);
  });

  it('outcome messages meet text contrast in both themes', () => {
    for (const name of ['ok', 'warn', 'error']) {
      expect(contrast(colour(`.emblem-os .os-notice-${name}`), lightCard)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colour(`.emblem-os.os-dark .os-notice-${name}`), darkCard)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reports copy success and failure, and never logs the link or code', () => {
    expect(profile).toContain('The invitation link is on your clipboard.');
    expect(profile).toContain('Could not copy the link. Try again, or copy it from a different browser.');
    const copyFn = profile.slice(profile.indexOf('const copyGuardianInviteLink'), profile.indexOf('};', profile.indexOf('const copyGuardianInviteLink')));
    expect(copyFn).not.toMatch(/console\./);
  });
});
