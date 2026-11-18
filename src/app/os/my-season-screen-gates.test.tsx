import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Screen-level gates, driven through the real components. The repo has no DOM
 * library, so React's hooks are replaced by a tiny runtime: a screen is called
 * as a function, its handlers are invoked directly, its effects are run, and
 * it is called again. Child components are left unexpanded, so a test reads
 * their props (for example LegacyFocusNotice's onRetry).
 */

const rt = vi.hoisted(() => {
  type Slot = { value: unknown; deps?: unknown[]; set?: (v: unknown) => void };
  let slots: Slot[] = [];
  let cursor = 0;
  let pending: (() => void)[] = [];
  let version = 0;
  const slot = (init: () => unknown): Slot => {
    const i = cursor++;
    slots[i] ??= { value: init() };
    return slots[i];
  };
  const changed = (a: unknown[] | undefined, b: unknown[] | undefined) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const call = <T,>(v: unknown, ...args: unknown[]) => (v as (...a: unknown[]) => T)(...args);
  return {
    data: {} as Record<string, unknown>,
    refresh: (async () => true) as () => Promise<boolean>,
    hooks: {
      useState(init: unknown) {
        const s = slot(() => (typeof init === 'function' ? call(init) : init));
        s.set ??= (v) => {
          const next = typeof v === 'function' ? call(v, s.value) : v;
          if (!Object.is(next, s.value)) {
            s.value = next;
            version++;
          }
        };
        return [s.value, s.set];
      },
      useRef: (init: unknown) => slot(() => ({ current: init })).value,
      useCallback(fn: unknown, deps: unknown[]) {
        const s = slot(() => fn);
        if (changed(s.deps, deps)) s.value = fn;
        s.deps = deps;
        return s.value;
      },
      useMemo(fn: unknown, deps: unknown[]) {
        const s = slot(() => undefined);
        if (changed(s.deps, deps)) s.value = call(fn);
        s.deps = deps;
        return s.value;
      },
      useEffect(fn: unknown, deps: unknown[]) {
        const s = slot(() => undefined);
        if (changed(s.deps, deps)) {
          pending.push(() => {
            if (typeof s.value === 'function') call(s.value);
            s.value = call(fn);
          });
        }
        s.deps = deps;
      },
    },
    reset() {
      slots = [];
      cursor = 0;
      pending = [];
      version = 0;
    },
    /** One render, effects not run: what the user sees before any effect. */
    renderOnce<T>(render: () => T): T {
      cursor = 0;
      pending = [];
      return render();
    },
    /** Renders and runs effects until nothing changes. */
    settle<T>(render: () => T): T {
      for (let i = 0; i < 30; i++) {
        const before = version;
        cursor = 0;
        pending = [];
        const out = render();
        const effects = pending;
        pending = [];
        effects.forEach((e) => e());
        if (!effects.length && version === before) return out;
      }
      throw new Error('the screen did not settle');
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  return { ...real, ...rt.hooks, default: { ...real, ...rt.hooks } };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/app/os/OsDataContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOsData: () => rt.data,
  useRefreshOsData: () => rt.refresh,
}));
vi.mock('@/app/os/usePresenceHeartbeat', () => ({ usePresenceHeartbeat: () => {} }));
vi.mock('@/app/os/useLiveContent', () => ({ useLiveContent: () => {}, useJustUpdatedFlag: () => [false, () => {}] }));
vi.mock('@/app/os/useOsPhotoUpload', () => ({ useOsPhotoUpload: () => ({ status: 'idle', error: null, uploadPhoto: () => {} }) }));

import CoachPlayerDetail from './screens/CoachPlayerDetail';
import CardScreen from './screens/Card';
import CoachMySeasonSection, { LegacyFocusNotice } from './screens/CoachMySeasonSection';
import { SeasonCheckFailed } from './mySeasonUi';
import { MS_IDS } from './mySeasonFlows';
import { DEMO_OS_DATA, type OsData } from './osData';
import { initialOsState } from './types';
import type { OsActions } from './OsApp';
import { MS_PLAYER_ID, MS_TEAM_ID, REAL_PARENT, findAll, msContent, textOf } from './my-season-test-support';

const OTHER_PLAYER = '30000000-0000-4000-8000-000000000002';
const actions = new Proxy({}, { get: () => vi.fn() }) as unknown as OsActions;
const squadPlayer = { ...DEMO_OS_DATA.squad[0], id: MS_PLAYER_ID, name: 'Riley Hart', teamId: MS_TEAM_ID, seasonFocus: [] };
const REAL_COACH: OsData = {
  ...DEMO_OS_DATA,
  mode: 'real',
  squad: [squadPlayer, { ...squadPlayer, id: OTHER_PLAYER, name: 'Sam Lee' }],
  verifyQueue: [],
  coachTeamsManaged: [{ id: MS_TEAM_ID, name: 'U10 Blues', playerCount: 1 }] as OsData['coachTeamsManaged'],
  mySeasonCoachLookup: true,
};

type El = { type: unknown; props: Record<string, unknown> };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const OFF = () => json(200, { enabled: false });
const FAILS = () => json(500, { code: 'failed' });

let lookup: () => Response | Promise<Response>;
let posts: { url: string; body: unknown }[];
let lookups: string[];
let focused: string[];

beforeEach(() => {
  rt.reset();
  rt.data = REAL_COACH;
  rt.refresh = async () => true;
  posts = [];
  lookups = [];
  focused = [];
  lookup = OFF;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/os/my-season?')) {
      lookups.push(url);
      return lookup();
    }
    if (url === '/api/os/season-focus') {
      posts.push({ url, body: JSON.parse(String(init?.body)) });
      return json(200, { ok: true, focusId: 'f1' });
    }
    return json(200, {});
  });
  vi.stubGlobal('document', { getElementById: (id: string) => ({ focus: () => focused.push(id) }) });
});
afterEach(() => vi.unstubAllGlobals());

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
const coach = (playerId = MS_PLAYER_ID) => () => CoachPlayerDetail({ playerId, actions }) as unknown;
async function open(playerId = MS_PLAYER_ID) {
  rt.settle(coach(playerId));
  await flush();
  return rt.settle(coach(playerId));
}
const kids = (el: El) => [el.props.children].flat(3) as unknown[];
/** The legacy Season Focus input and its Add button, located from the rendered tree. */
function legacyControls(tree: unknown) {
  const input = findAll(tree, (e) => e.type === 'input' && String(e.props.placeholder ?? '').includes('First touch under pressure'))[0];
  if (!input) return null;
  const row = findAll(tree, (e) => e.type === 'div' && kids(e).includes(input))[0];
  const add = kids(row).find((k) => isValidElement(k) && k.type === 'button') as ReactElement<Record<string, unknown>>;
  return { input, add };
}
const typeDraft = (tree: unknown) => (legacyControls(tree)!.input.props.onChange as (e: unknown) => void)({ target: { value: 'First touch' } });
const press = async (tree: unknown) => {
  (legacyControls(tree)!.add.props.onClick as () => unknown)();
  await flush();
};
const notice = (tree: unknown) => findAll(tree, (e) => e.type === LegacyFocusNotice)[0];

describe('coach screen: the legacy Add follows the lookup', () => {
  it('a failed lookup: with a non-empty draft Add is disabled, and pressing it sends nothing', async () => {
    lookup = FAILS;
    typeDraft(await open());
    const tree = rt.settle(coach());
    const c = legacyControls(tree)!;
    expect(c.input.props.value).toBe('First touch');
    expect(c.add.props.disabled).toBe(true);
    expect(c.input.props.disabled).toBe(true);
    await press(tree);
    expect(posts).toEqual([]);
  });

  it('still loading: the same', async () => {
    lookup = () => new Promise<Response>(() => {});
    typeDraft(await open());
    const tree = rt.settle(coach());
    expect(legacyControls(tree)!.add.props.disabled).toBe(true);
    await press(tree);
    expect(posts).toEqual([]);
  });

  it('confirmed off: Add works and posts the draft', async () => {
    typeDraft(await open());
    const tree = rt.settle(coach());
    const c = legacyControls(tree)!;
    expect(c.add.props.disabled).toBe(false);
    expect(c.input.props.disabled).toBe(false);
    await press(tree);
    expect(posts).toEqual([{ url: '/api/os/season-focus', body: { playerId: MS_PLAYER_ID, label: 'First touch' } }]);
  });

  it('no lookup needed: no request for My Season, and Add works', async () => {
    rt.data = { ...REAL_COACH, mySeasonCoachLookup: false };
    typeDraft(await open());
    const tree = rt.settle(coach());
    expect(lookups).toEqual([]);
    expect(legacyControls(tree)!.add.props.disabled).toBe(false);
  });

  it('enabled: the legacy controls go and My Season takes their place', async () => {
    lookup = () => json(200, msContent({ access: 'coach', canAddNote: true }));
    const tree = await open();
    expect(legacyControls(tree)).toBeNull();
    expect(findAll(tree, (e) => e.type === CoachMySeasonSection)).toHaveLength(1);
  });

  it("the hook scopes the answer to the player: the first render for a new player is not unlocked by the last one's", async () => {
    typeDraft(await open());
    expect(legacyControls(rt.settle(coach()))!.add.props.disabled).toBe(false);
    lookup = () => new Promise<Response>(() => {});
    const first = rt.renderOnce(coach(OTHER_PLAYER));
    expect(legacyControls(first)!.input.props.value).toBe('First touch');
    expect(legacyControls(first)!.add.props.disabled).toBe(true);
    expect((notice(first).props.gate as { notice: string }).notice).toBe('checking');
  });

  it('Retry asks again, keeps focus in the section, and a confirmed off unlocks Add', async () => {
    lookup = FAILS;
    const failed = await open();
    typeDraft(failed);
    expect(lookups).toHaveLength(1);
    lookup = OFF;
    (notice(failed).props.onRetry as () => void)();
    expect(focused).toEqual([MS_IDS.seasonSection]);
    await flush();
    const tree = rt.settle(coach());
    expect(lookups).toHaveLength(2);
    expect((notice(tree).props.gate as { notice: unknown }).notice).toBeNull();
    expect(legacyControls(tree)!.add.props.disabled).toBe(false);
  });

  it('the focus target wraps both sections, so it survives every answer', async () => {
    const wrapper = (t: unknown) => findAll(t, (e) => e.props?.id === MS_IDS.seasonSection)[0];
    lookup = FAILS;
    const failed = await open();
    expect(wrapper(failed).props.tabIndex).toBe(-1);
    expect(findAll(wrapper(failed), (e) => e.type === LegacyFocusNotice)).toHaveLength(1);
    lookup = () => json(200, msContent({ access: 'coach', canAddNote: true }));
    (notice(failed).props.onRetry as () => void)();
    await flush();
    expect(findAll(wrapper(rt.settle(coach())), (e) => e.type === CoachMySeasonSection)).toHaveLength(1);
  });
});

describe('family Card: a lookup that failed', () => {
  const card = () => CardScreen({ state: { ...initialOsState, activated: true, flipped: true }, actions }) as unknown;
  const focusRow = { id: 'lf1', label: 'First touch', status: 'active', authorRole: 'guardian', authorName: 'Pat', createdAt: '2026-09-01T10:00:00Z' };
  const addLink = (t: unknown) => findAll(t, (e) => e.type === 'div' && e.props.role === 'button' && textOf(e).includes('Add a Season Focus'))[0];
  const form = (t: unknown) => findAll(t, (e) => e.type === 'form')[0];
  const failedBox = (t: unknown) => findAll(t, (e) => e.type === SeasonCheckFailed)[0];
  const UNKNOWN = { ...REAL_PARENT, seasonFocus: [focusRow], mySeason: { enabled: 'unknown' } } as unknown as OsData;

  it('the focuses stay readable, Add is gone, and Retry is offered', () => {
    rt.data = UNKNOWN;
    const tree = rt.settle(card);
    expect(textOf(tree)).toContain('First touch');
    expect(addLink(tree)).toBeUndefined();
    expect(failedBox(tree)).toBeDefined();
  });

  it('an Add form already open closes while the state is unknown, and the draft returns with it', () => {
    rt.data = { ...REAL_PARENT, seasonFocus: [] };
    (addLink(rt.settle(card)).props.onClick as () => void)();
    const open = rt.settle(card);
    (findAll(form(open), (e) => e.type === 'input')[0].props.onChange as (e: unknown) => void)({ target: { value: 'Weak foot' } });
    expect(form(rt.settle(card))).toBeDefined();
    rt.data = { ...UNKNOWN, seasonFocus: [] };
    expect(form(rt.settle(card))).toBeUndefined();
    rt.data = { ...REAL_PARENT, seasonFocus: [] };
    expect(findAll(form(rt.settle(card)), (e) => e.type === 'input')[0].props.value).toBe('Weak foot');
  });

  it('Retry moves focus first, refreshes, shows it is busy, and a confirmed off brings Add back', async () => {
    rt.data = UNKNOWN;
    let finish!: (v: boolean) => void;
    const refresh = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    rt.refresh = refresh;
    (failedBox(rt.settle(card)).props.onRetry as () => void)();
    expect(focused).toEqual([MS_IDS.seasonSection]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(failedBox(rt.settle(card)).props.busy).toBe(true);
    rt.data = { ...UNKNOWN, mySeason: null };
    finish(true);
    await flush();
    const tree = rt.settle(card);
    expect(failedBox(tree)).toBeUndefined();
    expect(addLink(tree)).toBeDefined();
  });

  it('a retry that fails again leaves Retry usable', async () => {
    rt.data = UNKNOWN;
    rt.refresh = async () => false;
    (failedBox(rt.settle(card)).props.onRetry as () => void)();
    await flush();
    expect(failedBox(rt.settle(card)).props.busy).toBe(false);
  });
});
