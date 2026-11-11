import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { clubMonogram } from './clubMonogram';

describe('clubMonogram', () => {
  it('uses the first letter of the first two words', () => {
    expect(clubMonogram('Ashton United FC')).toBe('AU');
    expect(clubMonogram('ZZ Emblem Test Club')).toBe('ZE');
  });

  it('handles one word, digits, punctuation and extra spaces', () => {
    expect(clubMonogram('Westbrook')).toBe('W');
    expect(clubMonogram('1st  Denton')).toBe('1D');
    expect(clubMonogram("St. Mary's Juniors")).toBe('SM');
    expect(clubMonogram('  hyde   united ')).toBe('HU');
    expect(clubMonogram('Ölmez Spor')).toBe('ÖS');
  });

  it('never returns an empty string', () => {
    expect(clubMonogram('')).toBe('?');
    expect(clubMonogram(null)).toBe('?');
    expect(clubMonogram(undefined)).toBe('?');
    expect(clubMonogram(' - & - ')).toBe('?');
  });
});

describe('no real club crest is shown to coaches (F4)', () => {
  const root = path.resolve(__dirname, '..', '..', '..');

  it('the hard-coded Curzon Ashton Juniors crest is gone from the app', () => {
    expect(fs.existsSync(path.join(root, 'public', 'assets', 'emblem-os', 'club-badge.png'))).toBe(false);
  });

  it('no OS screen references club-badge.png', () => {
    const dir = path.join(root, 'src', 'app', 'os');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(dir);
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('club-badge.png'));
    expect(offenders).toEqual([]);
  });

  it('the real coach home shows the monogram, and only the demo uses the demo badge', () => {
    const home = fs.readFileSync(path.join(root, 'src', 'app', 'os', 'screens', 'CoachHome.tsx'), 'utf8');
    expect(home).toContain('clubMonogram(coachClub?.name)');
    expect(home).toContain('demo-club-badge.svg');
  });
});
