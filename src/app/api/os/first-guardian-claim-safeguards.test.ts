import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall, FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, sentinelError } from '@/lib/route-failure.test-support';
import { ensurePublicPlayerId } from '@/lib/public-player-id';
import { generateStoryUpdate } from '@/lib/story-updates';
import { POST as claim } from './claim/route';
import { POST as recover } from './recover/route';

// Gate 3.12: a current or former coach cannot use a child's card (claim code
// or purchaser recovery) to link their own coach account as its guardian, and
// a purchaser can recover a card themselves only from a one-card order. Every
// refusal happens before any write. Fictional data only.

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = id(1); // the claimant / purchaser
const OTHER = id(2);
const PLAYER = id(10);
const TEAM = id(20);
const CARD = id(30);
const ORDER = id(40);
const CODE = 'G39-FICTCODE';
const BUYER = 'fictional-buyer@example.test';
const CARD_SET = 'We need to verify this card set before linking it to your account. Please contact Emblem support.';
const CLAIM_REFUSED = "This card isn't available to claim";
const RECOVER_REFUSED = 'This card is not available to recover';

type World = Record<string, Array<Record<string, unknown>>>;
function world(extra: Partial<World> = {}, orderCards = 1): World {
  const cards = [{ id: CARD, claim_token: CODE, status: 'assigned', access_status: null, player_id: PLAYER, order_id: ORDER, orders: { purchaser_email: BUYER, payment_status: 'fulfilled' } }];
  for (let i = 1; i < orderCards; i++) cards.push({ ...cards[0], id: id(100 + i), claim_token: `G39-FICT${i}`, player_id: id(200 + i) });
  return { cards, players: [{ id: PLAYER, team_id: TEAM, name: 'Fictional Child' }], guardians: [], coach_team: [], coach_players: [], relationship_audit_events: [], profiles: [], ...extra };
}
function matches(row: Record<string, unknown>, [kind, col, value]: [string, string, unknown]) {
  if (kind === 'eq') return row[col] === value;
  if (kind === 'in') return (value as unknown[]).includes(row[col]);
  if (kind === 'is') return row[col] === value;
  return true;
}
function setup(w: World, fail?: (c: FakeCall) => FakeResult | undefined) {
  service = createFakeSupabase({
    respond: (c) => {
      const f = fail?.(c);
      if (f) return f;
      if (c.op !== 'select') return {};
      const rows = (w[c.table] ?? []).filter((r) => c.filters.every((flt) => matches(r, flt)));
      if ((c.options as { head?: boolean } | undefined)?.head) return { count: rows.length };
      if (['cards', 'players', 'profiles'].includes(c.table)) return { data: rows[0] ?? null };
      return { data: rows };
    },
    rpc: (fn) => (fn === 'ensure_profile_role' ? { data: 'parent' } : {}),
  });
}
const signedIn = (email = BUYER) => { session = createFakeSupabase({ user: { id: U, email } }); };
const postClaim = (body: Record<string, unknown> = { claimToken: CODE, displayName: 'Fictional Claimant' }) =>
  claim(new NextRequest('http://localhost/api/os/claim', { method: 'POST', body: JSON.stringify(body) }));
const postRecover = (body: Record<string, unknown> = { cardId: CARD, decision: 'self' }) =>
  recover(new NextRequest('http://localhost/api/os/recover', { method: 'POST', body: JSON.stringify(body) }));

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
  vi.mocked(ensurePublicPlayerId).mockClear();
  vi.mocked(generateStoryUpdate).mockClear();
});
afterEach(() => logs.restore());

function expectNoWrites() {
  expect(service.calls.filter((c) => c.op !== 'select')).toEqual([]);
  expect(session.calls.filter((c) => c.op !== 'select')).toEqual([]);
  expect(service.rpcCalls).toEqual([]);
  expect(ensurePublicPlayerId).not.toHaveBeenCalled();
  expect(generateStoryUpdate).not.toHaveBeenCalled();
}
async function expectFixed(res: Response, status: number, error: string) {
  const raw = await res.text();
  expect(res.status).toBe(status);
  expect(JSON.parse(raw)).toEqual({ error });
  expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|@example\.test|Fictional Child|G39-FICT|coach/i);
}
const guardianInserted = () => service.calls.some((c) => c.table === 'guardians' && c.op === 'insert');

const COACH_HISTORY: Array<[string, Partial<World>]> = [
  ['an active coach of the child\'s team', { coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: null }] }],
  ['an ended coach of the child\'s team', { coach_team: [{ team_id: TEAM, profile_id: U, ended_at: '2026-01-01T00:00:00Z', expires_at: null }] }],
  ['an expired coach of the child\'s team', { coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: '2026-01-01T00:00:00Z' }] }],
  ['a team coach whose assignment row is gone but recorded in the audit history', { relationship_audit_events: [{ table_name: 'coach_team', team_id: TEAM, profile_id: U, player_id: null }] }],
  ['the child\'s current direct coach', { coach_players: [{ player_id: PLAYER, profile_id: U }] }],
  ['a former direct coach (recorded in the audit history)', { relationship_audit_events: [{ table_name: 'coach_players', team_id: null, profile_id: U, player_id: PLAYER }] }],
];

describe('POST /api/os/claim — a coach cannot claim the child with their own coach account', () => {
  for (const [who, extra] of COACH_HISTORY) {
    it(`${who}: the fixed refusal, before any profile, role, guardian, card, public id, audit or notification write`, async () => {
      setup(world(extra));
      signedIn();
      await expectFixed(await postClaim(), 400, CLAIM_REFUSED);
      expectNoWrites();
      expect(logs.text()).toBe(JSON.stringify([[], [], [], []]));
    });
  }

  it('a role-only coach (no assignment, link or history) is an ordinary claimant: the first-guardian claim succeeds', async () => {
    setup(world({ profiles: [{ id: U, role: 'coach', display_name: 'Fictional Role Coach' }] }));
    signedIn();
    const res = await postClaim();
    expect(res.status).toBe(200);
    expect(guardianInserted()).toBe(true);
  });

  it('an unrelated adult with the valid code follows the established first-guardian path', async () => {
    setup(world());
    signedIn();
    const res = await postClaim();
    expect(res.status).toBe(200);
    expect(guardianInserted()).toBe(true);
    expect(service.rpcCalls.map((r) => r.fn)).toContain('ensure_profile_role');
  });

  it('a coach of a DIFFERENT team (no relationship to this child) is not refused', async () => {
    setup(world({ coach_team: [{ team_id: id(21), profile_id: U, ended_at: null, expires_at: null }] }));
    signedIn();
    expect((await postClaim()).status).toBe(200);
  });

  it('an existing guardian who also coaches keeps the existing path (not refused as a coach); nothing removes their link', async () => {
    setup(world({ guardians: [{ player_id: PLAYER, profile_id: U }], coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: null }] }),
      (c) => (c.table === 'guardians' && c.op === 'insert' ? { error: { code: '23505', message: 'duplicate' } } : undefined));
    signedIn();
    const res = await postClaim();
    expect(res.status).toBe(409);
    expect(service.calls.some((c) => c.table === 'guardians' && (c.op === 'delete' || c.op === 'update'))).toBe(false);
  });

  it('a replayed (already claimed) code stays refused', async () => {
    const w = world();
    w.cards[0].status = 'claimed';
    setup(w);
    signedIn();
    const res = await postClaim();
    expect(res.status).toBe(400);
    expect(guardianInserted()).toBe(false);
  });

  it('an unknown or malformed code is the existing invalid response, with no write', async () => {
    setup(world());
    signedIn();
    await expectFixed(await postClaim({ claimToken: 'NOT-A-REAL-CODE' }), 400, "This code isn't valid or has already been claimed");
    expectNoWrites();
  });

  it('a failed eligibility read is a generic 500 with a code-only log and no write', async () => {
    setup(world(), (c) => (c.table === 'coach_team' && c.op === 'select' ? { error: sentinelError('08006') } : undefined));
    signedIn();
    await expectFixed(await postClaim(), 500, 'Could not claim this player. Please try again.');
    expectNoWrites();
    expectCodeOnlyLogs(logs, 'claim: eligibility', '08006');
  });

  it('documented limitation: an otherwise unrelated second account is not, and cannot be, identified as the coach\'s from account data', async () => {
    // The coach (U) has coach history; OTHER is a separate account with none. The app
    // has no data linking OTHER to the coach, so OTHER's claim is the ordinary path.
    setup(world({ coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: null }] }));
    session = createFakeSupabase({ user: { id: OTHER, email: 'fictional-other@example.test' } });
    expect((await postClaim()).status).toBe(200);
  });
});

describe('POST /api/os/recover (self) — only a one-card order, and never a coach of the child', () => {
  it('a one-card order: the verified purchaser recovers their card (unchanged)', async () => {
    setup(world({}, 1));
    signedIn();
    const res = await postRecover();
    expect(res.status).toBe(200);
    expect(guardianInserted()).toBe(true);
  });

  for (const [label, n] of [['a two-card order', 2], ['a large squad order', 18]] as const) {
    it(`${label}: refused with the fixed card-set message before any write`, async () => {
      setup(world({}, n));
      signedIn();
      await expectFixed(await postRecover(), 409, CARD_SET);
      expectNoWrites();
      expect(logs.text()).toBe(JSON.stringify([[], [], [], []]));
    });
  }

  it('a non-coach sibling purchaser is refused too, because the order has several cards', async () => {
    setup(world({ profiles: [{ id: U, role: 'parent' }] }, 3));
    signedIn();
    await expectFixed(await postRecover(), 409, CARD_SET);
    expectNoWrites();
  });

  it('the buyer-coach (active coach of the child\'s team) of a squad order is refused', async () => {
    setup(world({ coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: null }] }, 12));
    signedIn();
    await expectFixed(await postRecover(), 409, CARD_SET);
    expectNoWrites();
  });

  it('an ended buyer-coach of a squad order stays refused', async () => {
    setup(world({ coach_team: [{ team_id: TEAM, profile_id: U, ended_at: '2026-01-01T00:00:00Z', expires_at: null }] }, 12));
    signedIn();
    await expectFixed(await postRecover(), 409, CARD_SET);
    expectNoWrites();
  });

  it('a caller-supplied card count is ignored: the database count decides', async () => {
    setup(world({}, 4));
    signedIn();
    await expectFixed(await postRecover({ cardId: CARD, decision: 'self', cardCount: 1, orderCardCount: 1, count: 1 }), 409, CARD_SET);
    expectNoWrites();
  });

  it('a coach of the child is refused even on a one-card order (same rule as a code claim)', async () => {
    setup(world({ coach_team: [{ team_id: TEAM, profile_id: U, ended_at: null, expires_at: null }] }, 1));
    signedIn();
    await expectFixed(await postRecover(), 400, RECOVER_REFUSED);
    expectNoWrites();
  });

  it('a failed order card count is a generic 500 with a code-only log and no write', async () => {
    setup(world({}, 1), (c) => (c.table === 'cards' && (c.options as { head?: boolean } | undefined)?.head ? { error: sentinelError('08006') } : undefined));
    signedIn();
    await expectFixed(await postRecover(), 500, 'Could not recover this card. Please try again.');
    expectNoWrites();
    expectCodeOnlyLogs(logs, 'recover: order card count', '08006');
  });

  it('a malformed card/order relationship (no linked order) fails safely with no write', async () => {
    const w = world({}, 1);
    w.cards[0].orders = null;
    w.cards[0].order_id = null;
    setup(w);
    signedIn();
    const res = await postRecover();
    expect(res.status).toBe(400);
    expectNoWrites();
  });

  it('an email mismatch stays refused (unchanged), before any write', async () => {
    setup(world({}, 1));
    signedIn('fictional-someone-else@example.test');
    await expectFixed(await postRecover(), 400, RECOVER_REFUSED);
    expectNoWrites();
  });

  it('replay: an already-claimed card is refused, before any write', async () => {
    const w = world({}, 1);
    w.cards[0].status = 'claimed';
    setup(w);
    signedIn();
    expect((await postRecover()).status).toBe(400);
    expectNoWrites();
  });

  it('a refusal for one child on a card set protects every child on it (each card refused alike)', async () => {
    const w = world({}, 3);
    setup(w);
    signedIn();
    for (const c of w.cards) {
      await expectFixed(await postRecover({ cardId: c.id, decision: 'self' }), 409, CARD_SET);
    }
    expectNoWrites();
  });

  it('the handoff decision is not changed by this gate (still the trusted single-card handoff path)', async () => {
    setup(world({}, 1));
    signedIn();
    const res = await postRecover({ cardId: CARD, decision: 'handoff' });
    // No handoff email given: the existing validation answers, unchanged.
    expect(res.status).toBe(400);
  });
});
