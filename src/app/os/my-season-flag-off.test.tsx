import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Flag-off contract: with My Season not enabled for the player (the
 * default everywhere), the OS renders exactly as before, the client makes
 * no My Season call, the bottom navigation is unchanged and /os/demo never
 * touches My Season.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    throw new Error('not used');
  },
  createServiceRoleClient: () => {
    throw new Error('not used');
  },
}));

import PlayerHome from './screens/PlayerHome';
import CardScreen from './screens/Card';
import CoachPlayerDetail from './screens/CoachPlayerDetail';
import { OsDataProvider } from './OsDataContext';
import { DEMO_OS_DATA, PUBLIC_DEMO_OS_DATA, type OsData } from './osData';
import { initialOsState } from './types';
import type { OsActions } from './OsApp';
import { PLAYER_NAV_ITEMS, COACH_NAV_ITEMS } from './navigation/navItems';
import { shouldLookUpCoachMySeason } from './mySeasonClient';
import { loadParentMySeason } from '@/lib/os-data';
import { MS_PLAYER_ID, MS_TEAM_ID, REAL_PARENT, msContent } from './my-season-test-support';

const actions = new Proxy({}, { get: () => vi.fn() }) as unknown as OsActions;
const home = (data: OsData) => renderToStaticMarkup(<OsDataProvider value={data}><PlayerHome actions={actions} storyUpdates={[]} /></OsDataProvider>);
const cardBack = (data: OsData) => renderToStaticMarkup(<OsDataProvider value={data}><CardScreen state={{ ...initialOsState, activated: true, flipped: true }} actions={actions} /></OsDataProvider>);
const squadPlayer = { ...DEMO_OS_DATA.squad[0], id: MS_PLAYER_ID, name: 'Riley Hart', teamId: MS_TEAM_ID };
const REAL_COACH: OsData = { ...DEMO_OS_DATA, mode: 'real', squad: [squadPlayer], verifyQueue: [], coachTeamsManaged: [{ id: MS_TEAM_ID, name: 'U10 Blues', playerCount: 1 }] as OsData['coachTeamsManaged'] };
const coachDetail = (data: OsData) => renderToStaticMarkup(<OsDataProvider value={data}><CoachPlayerDetail playerId={MS_PLAYER_ID} actions={actions} /></OsDataProvider>);

const withoutKeys = (d: OsData): OsData => {
  const copy = { ...d } as Partial<OsData>;
  delete copy.mySeason;
  delete copy.mySeasonCoachLookup;
  return copy as OsData;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('flag off: identical rendering', () => {
  it('PlayerHome renders the same with mySeason absent, null or disabled, and shows no My Season UI', () => {
    const baseline = home(withoutKeys(REAL_PARENT));
    expect(home({ ...REAL_PARENT, mySeason: null })).toBe(baseline);
    expect(home({ ...REAL_PARENT, mySeason: { enabled: false } })).toBe(baseline);
    expect(baseline).not.toContain('My Season');
    expect(baseline).not.toContain('My Focus');
    expect(baseline).toContain('This Season');
  });

  it('demo PlayerHome is unchanged by a stray mySeason value (demo never shows My Season)', () => {
    expect(home({ ...PUBLIC_DEMO_OS_DATA, mySeason: msContent() })).toBe(home(PUBLIC_DEMO_OS_DATA));
  });

  it('Card back keeps the legacy Season Focus section and renders the same', () => {
    const baseline = cardBack(withoutKeys(REAL_PARENT));
    expect(baseline).toContain('SEASON FOCUS');
    expect(cardBack({ ...REAL_PARENT, mySeason: null })).toBe(baseline);
    expect(cardBack({ ...REAL_PARENT, mySeason: { enabled: false } })).toBe(baseline);
  });

  it('CoachPlayerDetail renders the same whether or not lookups are allowed, with the legacy Season Focus section', () => {
    const baseline = coachDetail(withoutKeys(REAL_COACH));
    expect(baseline).toContain('Season Focus');
    expect(baseline).not.toContain('My Season');
    expect(coachDetail({ ...REAL_COACH, mySeasonCoachLookup: false })).toBe(baseline);
    expect(coachDetail({ ...REAL_COACH, mySeasonCoachLookup: true })).toBe(baseline);
  });
});

describe('flag off: no client network call', () => {
  it('the coach screen only asks when real, allowed by the deploy switch and the player is on a team', () => {
    expect(shouldLookUpCoachMySeason({ isReal: true, lookup: true, teamId: MS_TEAM_ID })).toBe(true);
    expect(shouldLookUpCoachMySeason({ isReal: false, lookup: true, teamId: MS_TEAM_ID })).toBe(false);
    expect(shouldLookUpCoachMySeason({ isReal: true, lookup: false, teamId: MS_TEAM_ID })).toBe(false);
    expect(shouldLookUpCoachMySeason({ isReal: true, lookup: undefined, teamId: MS_TEAM_ID })).toBe(false);
    expect(shouldLookUpCoachMySeason({ isReal: true, lookup: true, teamId: null })).toBe(false);
  });

  it('rendering Home, Card and the coach screen with My Season off never calls fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    home(REAL_PARENT);
    cardBack(REAL_PARENT);
    coachDetail(REAL_COACH);
    expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('my-season'))).toEqual([]);
  });

  it('PlayerHome only opens the My Season screen (the one that fetches) from the enabled guardian card', () => {
    const src = readFileSync('src/app/os/screens/PlayerHome.tsx', 'utf8');
    expect(src).toMatch(/mySeasonOpen && mySeasonGuardianView && playerId && \(/);
  });
});

describe('os-data parent load', () => {
  const rpcClient = (result: unknown) => {
    const rpc = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
    return { client: { rpc } as unknown as Parameters<typeof loadParentMySeason>[0], rpc };
  };

  it('deploy kill switch on: never calls the RPC', async () => {
    vi.stubEnv('SEASON_FEATURE_KILL_SWITCH', 'true');
    const { client, rpc } = rpcClient({ data: msContent(), error: null });
    expect(await loadParentMySeason(client, MS_PLAYER_ID)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('null when disabled, on an error (e.g. app deployed before 0108), on a malformed answer or a throw', async () => {
    for (const r of [{ data: { enabled: false }, error: null }, { data: null, error: { code: 'PGRST202', message: 'function not found' } }, { data: { enabled: 'yes' }, error: null }, new Error('network')]) {
      expect(await loadParentMySeason(rpcClient(r).client, MS_PLAYER_ID)).toBeNull();
    }
  });

  it('the enabled view when the feature is on', async () => {
    const { client, rpc } = rpcClient({ data: msContent(), error: null });
    expect(await loadParentMySeason(client, MS_PLAYER_ID)).toEqual(msContent());
    expect(rpc).toHaveBeenCalledWith('my_season_for_player', { p_player_id: MS_PLAYER_ID });
  });
});

describe('navigation and /os/demo', () => {
  it('the bottom navigation is unchanged', () => {
    expect(PLAYER_NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Card', 'Collection', 'Profile']);
    expect(COACH_NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Team', 'Celebrate', 'Verify', 'Profile']);
    for (const f of readdirSync('src/app/os/navigation')) {
      expect(readFileSync(join('src/app/os/navigation', f), 'utf8')).not.toMatch(/my.?season/i);
    }
  });

  it('demo data and /os/demo never reference My Season', () => {
    expect('mySeason' in DEMO_OS_DATA).toBe(false);
    expect('mySeason' in PUBLIC_DEMO_OS_DATA).toBe(false);
    expect('mySeasonCoachLookup' in DEMO_OS_DATA).toBe(false);
    expect(JSON.stringify(PUBLIC_DEMO_OS_DATA)).not.toMatch(/my.?season/i);
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
    for (const f of [...walk('src/app/os/demo'), 'src/app/os/data.tsx', 'src/app/os/playerProfile.ts']) {
      expect(readFileSync(f, 'utf8'), f.split(sep).join('/')).not.toMatch(/my.?season/i);
    }
  });
});
