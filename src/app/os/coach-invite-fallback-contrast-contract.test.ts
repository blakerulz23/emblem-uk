import fs from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * The coach "Add Player" outcome on CoachTeam: when the invitation email
 * could not be sent, the warning must stay readable on the card in both
 * themes. Contrast is computed from os.css itself (WCAG 2.x relative
 * luminance), the same way as the Profile fallback contract.
 */
const css = fs.readFileSync('src/app/os/os.css', 'utf8');
const coachTeam = fs.readFileSync('src/app/os/screens/CoachTeam.tsx', 'utf8');

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: Rgb, b: Rgb) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is defined`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}
const token = (theme: string, name: string) => hex(block(theme).match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))![1]);
const colour = (selector: string) => hex(block(selector).match(/color:\s*(#[0-9A-Fa-f]{6})/)![1]);

const lightCard = token('.emblem-os', '--os-card');
const darkCard = token('.emblem-os.os-dark', '--os-card');
const MESSAGE = 'The invitation email could not be sent.';

function warning(): string {
  const at = coachTeam.indexOf(MESSAGE);
  expect(at, 'the not-emailed warning is rendered').toBeGreaterThan(-1);
  return coachTeam.slice(coachTeam.lastIndexOf('<div', at), at);
}

describe('CoachTeam invitation-not-emailed warning', () => {
  it('uses the themed warning class, with no hard-coded colour', () => {
    const el = warning();
    expect(el).toContain('role="status"');
    expect(el).toContain('className="os-notice-warn"');
    expect(el).not.toMatch(/color:\s*'#/);
  });

  it('meets 4.5:1 text contrast on the card in light and dark mode', () => {
    expect(contrast(colour('.emblem-os .os-notice-warn'), lightCard)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour('.emblem-os.os-dark .os-notice-warn'), darkCard)).toBeGreaterThanOrEqual(4.5);
  });

  it('the colour it replaced failed on the dark card', () => {
    expect(contrast(hex('#C4501C'), darkCard)).toBeLessThan(4.5);
  });
});
