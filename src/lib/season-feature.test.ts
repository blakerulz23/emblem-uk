import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSeasonFeatureState, isSeasonDeployKillSwitchOn, isSeasonFeatureState, resolveSeasonFeatureState } from './season-feature';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSeasonFeatureState', () => {
  it('is off by default (no team row, no global row)', () => {
    expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: null, teamState: null })).toBe('off');
    expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: false, teamState: undefined })).toBe('off');
  });

  it("returns the team's state when neither kill switch is on", () => {
    for (const s of ['off', 'demo', 'pilot', 'on'] as const) {
      expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: false, teamState: s })).toBe(s);
    }
  });

  it('the deploy kill switch forces off over pilot and on', () => {
    for (const s of ['demo', 'pilot', 'on']) {
      expect(resolveSeasonFeatureState({ deployKillSwitch: true, globalKillSwitch: false, teamState: s })).toBe('off');
    }
  });

  it('the database kill switch forces off over pilot and on', () => {
    for (const s of ['demo', 'pilot', 'on']) {
      expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: true, teamState: s })).toBe('off');
    }
  });

  it('a missing global row fails closed', () => {
    expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: undefined, teamState: 'pilot' })).toBe('off');
  });

  it('unknown or malformed team values resolve to off', () => {
    for (const v of ['ON', 'Pilot', 'enabled', 'true', '', 1, true, {}, ['on']]) {
      expect(resolveSeasonFeatureState({ deployKillSwitch: false, globalKillSwitch: false, teamState: v })).toBe('off');
      expect(isSeasonFeatureState(v)).toBe(false);
    }
  });
});

describe('SEASON_FEATURE_KILL_SWITCH', () => {
  it("engages only on the exact string 'true'", () => {
    expect(isSeasonDeployKillSwitchOn({ SEASON_FEATURE_KILL_SWITCH: 'true' })).toBe(true);
    for (const v of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      expect(isSeasonDeployKillSwitchOn({ SEASON_FEATURE_KILL_SWITCH: v })).toBe(false);
    }
  });

  it('reads process.env by default', () => {
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    expect(isSeasonDeployKillSwitchOn()).toBe(true);
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', '');
    expect(isSeasonDeployKillSwitchOn()).toBe(false);
  });
});

describe('getSeasonFeatureState (Phase 0)', () => {
  it('is off for any team, with or without the kill switch', async () => {
    for (const team of ['00000000-0000-4000-8000-000000000001', 'demo-team-u10', '', null, undefined]) {
      expect(await getSeasonFeatureState(team)).toBe('off');
    }
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    expect(await getSeasonFeatureState('00000000-0000-4000-8000-000000000001')).toBe('off');
  });

  it('only the My Season route guard and os-data import the Season flag', () => {
    // Phase 1: the deploy kill switch is read by the /api/os/my-season route
    // guard and by os-data (which then never calls the RPC). No client
    // component may import it (it reads process.env).
    const allowed = ['src/lib/my-season-api.ts', 'src/lib/os-data.ts'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name) || p.split(sep).join('/').endsWith('src/lib/season-feature.ts')) continue;
        if (readFileSync(p, 'utf8').includes('season-feature')) hits.push(p.split(sep).join('/'));
      }
    };
    walk('src');
    expect(hits.sort()).toEqual(allowed);
  });

  it('is server-only: it never touches a NEXT_PUBLIC_ variable', () => {
    expect(readFileSync('src/lib/season-feature.ts', 'utf8')).not.toContain('NEXT_PUBLIC_');
  });
});
