import { Fragment, isValidElement, type ReactElement } from 'react';
import type { MySeasonContent, MySeasonFocus, MySeasonObservation } from '@/lib/my-season';
import { DEMO_OS_DATA, type OsData } from './osData';

/**
 * Test-only fixtures and a tiny element-tree walker for the My Season UI
 * tests (no DOM library in this repo: hookless presentational components
 * are expanded by calling them, then handlers are invoked directly).
 * Riley Hart and Coach Danny are fictional.
 */

export const MS_PLAYER_ID = '30000000-0000-4000-8000-000000000001';
export const MS_TEAM_ID = '60000000-0000-4000-8000-000000000001';

export const msFocus = (o: Partial<MySeasonFocus> = {}): MySeasonFocus => ({
  id: 'f1',
  title: 'Talk more on the pitch',
  whyItMatters: "So my teammates know where I am and when I'm free.",
  whatItLooksLike: 'Calling for the ball in every game.',
  startedOn: '2026-09-06',
  endedAt: null,
  authorRole: 'coach',
  authorName: 'Coach Danny',
  ...o,
});

export const msNote = (o: Partial<MySeasonObservation> = {}): MySeasonObservation => ({
  id: 'o1',
  category: 'spoke_up',
  body: 'Called for the ball twice in the second half and told Sam where the space was.',
  createdAt: '2026-11-15T10:00:00Z',
  coachName: 'Coach Danny',
  formerCoach: false,
  mine: false,
  withdrawn: false,
  ...o,
});

export const msContent = (o: Partial<MySeasonContent> = {}): MySeasonContent => ({
  enabled: true,
  access: 'guardian',
  canEditFocus: true,
  canAddNote: false,
  activeFocus: msFocus(),
  earlierFocuses: [msFocus({ id: 'f0', title: 'Keep my head up', startedOn: '2026-04-01', endedAt: '2026-08-30T00:00:00Z' })],
  observations: [msNote(), msNote({ id: 'o2', category: 'kept_going', body: 'We were 3-0 down and Riley was still chasing every ball.', createdAt: '2026-08-08T10:00:00Z' })],
  ...o,
});

export const REAL_PARENT: OsData = {
  ...DEMO_OS_DATA,
  mode: 'real',
  playerId: MS_PLAYER_ID,
  playerProfile: { ...DEMO_OS_DATA.playerProfile, name: 'Riley Hart', season: '2026/27' },
  moments: [],
  currentSeasonStatus: 'active',
  seasonFocus: [],
};

/** Expands hookless function components; leaves hook-using ones (they throw outside render) unexpanded. */
export function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    try {
      return expand((el.type as (p: unknown) => unknown)(el.props));
    } catch {
      return el;
    }
  }
  if ((el.type as unknown) === Fragment) return expand(el.props.children);
  const children = el.props?.children;
  return { ...el, props: { ...el.props, children: children === undefined ? undefined : expand(children) } };
}

type El = { type: unknown; props: Record<string, unknown> };

export function findAll(node: unknown, pred: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
    return out;
  }
  if (!node || typeof node !== 'object' || !('props' in (node as object))) return out;
  const el = node as El;
  if (pred(el)) out.push(el);
  findAll(el.props?.children, pred, out);
  return out;
}

export function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object' && 'props' in (node as object)) return textOf((node as El).props?.children);
  return '';
}

export function buttonByText(tree: unknown, text: string): El | null {
  return findAll(tree, (el) => el.type === 'button' && textOf(el).trim() === text)[0] ?? null;
}
