import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIVE_CELEBRATE_CATEGORIES, CELEBRATE_GROUPS, RETIRED_CELEBRATE_LABELS, isActiveCelebrateLabel } from './celebrate-categories';
import { CELEBRATE_CATS, COACH_ACTIVITY, MOMENTS } from '@/app/os/data';
import { SKILL_CATEGORIES } from '@/app/os/playerProfile';

const ACTIVE = ['Hat Trick', 'Clean Sheet', 'Great Teammate', 'Leadership'];
const RETIRED = ['Player of the Match', 'First Goal', 'Hardest Worker', 'Most Improved', "Coach's Award"];
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('Celebrate categories (single source of truth)', () => {
  it('the active list is exactly the four approved categories, with unique labels and keys', () => {
    expect(ACTIVE_CELEBRATE_CATEGORIES.map((c) => c.label)).toEqual(ACTIVE);
    expect(ACTIVE_CELEBRATE_CATEGORIES.map((c) => c.key)).toEqual(['hat-trick', 'clean-sheet', 'great-teammate', 'leadership']);
    expect(new Set(ACTIVE_CELEBRATE_CATEGORIES.map((c) => c.label)).size).toBe(4);
    expect(new Set(ACTIVE_CELEBRATE_CATEGORIES.map((c) => c.key)).size).toBe(4);
  });

  it('keeps the same stored labels and emoji as before, so new rows match historical ones', () => {
    expect(ACTIVE_CELEBRATE_CATEGORIES.map((c) => [c.group, c.label, c.emoji])).toEqual([
      ['Match', 'Hat Trick', '🎩'], ['Match', 'Clean Sheet', '🧤'], ['Character', 'Great Teammate', '❤️'], ['Character', 'Leadership', '🧠'],
    ]);
  });

  it('retires the five ranking/once-only labels, and none of them is active', () => {
    expect([...RETIRED_CELEBRATE_LABELS]).toEqual(RETIRED);
    for (const label of RETIRED) expect(isActiveCelebrateLabel(label)).toBe(false);
  });

  it('no active label is a ranking or a once-only first', () => {
    for (const { label } of ACTIVE_CELEBRATE_CATEGORIES) expect(label).not.toMatch(/\b(most|best|hardest|of the match|first|award)\b/i);
  });

  it('accepts only an exact active label', () => {
    for (const label of ACTIVE) expect(isActiveCelebrateLabel(label)).toBe(true);
    for (const v of ['hat trick', ' Leadership', 'Leadership ', 'Great teammate', '', 'Man of the Match', null, undefined, 4, ['Leadership']]) {
      expect(isActiveCelebrateLabel(v)).toBe(false);
    }
  });

  it("the sheet's CELEBRATE_CATS is the shared list (contract), grouped Match then Character", () => {
    expect(CELEBRATE_CATS).toEqual(CELEBRATE_GROUPS.map(({ group, items }) => ({ group, items: items.map((c) => [c.label, c.emoji]) })));
    expect(CELEBRATE_CATS).toEqual([
      { group: 'Match', items: [['Hat Trick', '🎩'], ['Clean Sheet', '🧤']] },
      { group: 'Character', items: [['Great Teammate', '❤️'], ['Leadership', '🧠']] },
    ]);
    expect(read('src/app/os/overlays/CelebrateSheet.tsx')).toContain("import { CELEBRATE_CATS } from '../data'");
  });

  it('the celebrate route validates with the shared list and does not import the client fixture file', () => {
    const route = read('src/app/api/os/celebrate/route.ts');
    expect(route).toContain("import { isActiveCelebrateLabel } from '@/lib/celebrate-categories'");
    expect(route).toContain('if (!isActiveCelebrateLabel(award))');
    expect(route).not.toMatch(/from '@\/app\/os\/data'|from '.*os\/data'/);
    // The check sits before the duplicate lookup and the insert.
    expect(route.indexOf('isActiveCelebrateLabel(award)')).toBeLessThan(route.indexOf(".from('moments')"));
  });

  it('nothing that displays moments filters them by the active list, so historical retired titles keep showing', () => {
    for (const p of ['src/lib/os-data.ts', 'src/lib/public-player-profile.ts']) {
      expect(read(p)).not.toContain('celebrate-categories');
    }
  });
});

describe('Public demo: no retired category as a new celebration', () => {
  it('the demo coach activity only celebrates active categories', () => {
    const celebrated = COACH_ACTIVITY.filter((a) => a.text.startsWith('You celebrated'));
    expect(celebrated.length).toBeGreaterThan(0);
    for (const a of celebrated) {
      // "You celebrated Riley Hart as a Great Teammate" (main's no-em-dash copy).
      const label = a.text.replace(/^You celebrated .+? as an? /, '');
      expect(isActiveCelebrateLabel(label)).toBe(true);
    }
  });

  it('no demo moment, coach activity, celebrate tile or skill recognition uses "Player of the Match"', () => {
    const demo = JSON.stringify({ CELEBRATE_CATS, COACH_ACTIVITY, MOMENTS, SKILL_CATEGORIES });
    expect(demo).not.toContain('Player of the Match');
    for (const label of ["Coach's Award", 'Hardest Worker', 'Most Improved']) expect(demo).not.toContain(label);
  });
});
