import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADD_ACH } from './data';
import { isRetiredAddMomentTitle, RETIRED_ADD_MOMENT_TITLES } from '@/lib/add-moment-titles';

describe('Add a moment: achievement list', () => {
  it('no longer offers Player of the Match', () => {
    expect(ADD_ACH.map((a) => a.label)).not.toContain('Player of the Match');
    expect(ADD_ACH.map((a) => a.id)).not.toContain('potm');
    for (const a of ADD_ACH) expect(isRetiredAddMomentTitle(a.label)).toBe(false);
  });

  it('keeps every other item unchanged and in order', () => {
    expect(ADD_ACH.map((a) => [a.id, a.label, a.rank])).toEqual([
      ['goal', 'First Goal', 'e1'],
      ['tournament', 'Tournament Winner', 'e6'],
      ['photo', 'Team Photo', 'e2'],
      ['captain', 'Captain', 'e5'],
      ['cleansheet', 'Clean Sheet', 'e4'],
      ['award', 'Award', 'e4'],
      ['custom', 'Custom', 'e2'],
    ]);
  });

  it('retires exactly one label', () => {
    expect(RETIRED_ADD_MOMENT_TITLES).toEqual(['Player of the Match']);
    expect(isRetiredAddMomentTitle(undefined)).toBe(false);
    expect(isRetiredAddMomentTitle(42)).toBe(false);
  });
});

describe('Historical Player of the Match moments', () => {
  it('nothing that displays moments reads the retired list, so saved ones keep showing', () => {
    for (const p of ['src/lib/os-data.ts', 'src/lib/public-player-profile.ts', 'src/app/os/OsApp.tsx', 'src/app/os/overlays/AddMomentFlow.tsx']) {
      expect(readFileSync(resolve(process.cwd(), p), 'utf8')).not.toContain('add-moment-titles');
    }
  });
});
