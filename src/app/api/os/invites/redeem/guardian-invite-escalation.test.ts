import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall, FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, sentinelError } from '@/lib/route-failure.test-support';
import { GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE } from '@/lib/guardian-invite-eligibility';
import { ensurePublicPlayerId } from '@/lib/public-player-id';
import { generateStoryUpdate } from '@/lib/story-updates';
import { POST as redeem } from './route';

/**
 * Gate 3.7: a guardian invite must not let a coach, or the invite's own
 * creator, link themselves as a guardian. Every refusal is the same fixed
 * 403, decided before any write: no role, guardian row, card lock, public
 * id, invite consumption or notification. The world below is filtered by
 * each query's own filters, so a scenario's rows are only seen when the
 * route asks for them. (The same rules run against the real schema in
 * supabase/tests/authz/guardian_invite_redemption_test.mjs.)
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: vi.fn(async () => ['coach-active-0000']) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = {
  redeemer: id(1),
  guardian: id(2),
  coach: id(3),
  dual: id(4),
  purchaser: id(5),
  formerCoach: id(6),
  otherAdult: id(7),
};
const PLAYER = id(100);
const TEAM = id(200);
const PREVIOUS_TEAM = id(201);
const ORDER = id(300);
const OTHER_ORDER = id(301);
const CODE = 'INV-FICT1234';

type World = Record<string, Array<Record<string, unknown>>>;
type InviteFields = { created_by: string | null; order_id?: string | null };

function baseWorld(invite: InviteFields): World {
  return {
    player_invites: [{ id: 'invite-1', code: CODE, used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER, order_id: null, ...invite }],
    players: [{ id: PLAYER, team_id: TEAM, name: 'Fictional Child' }],
    guardians: [],
    coach_team: [],
    coach_players: [],
    relationship_audit_events: [],
    cards: [],
    orders: [],
    profiles: [{ id: P.redeemer, display_name: 'Fictional Redeemer' }],
  };
}

function matches(row: Record<string, unknown>, [kind, col, value]: [string, string, unknown]) {
  if (kind === 'eq') return row[col] === value;
  if (kind === 'in') return (value as unknown[]).includes(row[col]);
  if (kind === 'is') return row[col] === value;
  if (kind === 'gt') return String(row[col]) > String(value);
  return true;
}

type Users = Record<string, { email: string; email_confirmed_at: string | null }>;

function setup(world: World, { users = {}, fail }: { users?: Users; fail?: (c: FakeCall) => FakeResult | undefined } = {}) {
  service = createFakeSupabase({
    respond: (c) => {
      const f = fail?.(c);
      if (f) return f;
      if (c.op !== 'select') return {};
      const rows = (world[c.table] ?? []).filter((r) => c.filters.every((flt) => matches(r, flt)));
      // Single-row reads behave like maybeSingle.
      if (['player_invites', 'players', 'profiles'].includes(c.table)) return { data: rows[0] ?? null };
      return { data: rows };
    },
    rpc: (fn) => (fn === 'ensure_profile_role' ? { data: 'parent' } : {}),
    adminUser: (uid) => (users[uid] ? { user: { id: uid, ...users[uid] } } : { user: null }),
  });
}

const post = (redeemerId = P.redeemer) => {
  session = createFakeSupabase({ user: { id: redeemerId, email: 'fictional-redeemer@example.test' } });
  return redeem(new NextRequest('http://localhost/api/os/invites/redeem', { method: 'POST', body: JSON.stringify({ inviteCode: CODE }) }));
};

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
  expect(session.rpcCalls).toEqual([]);
  expect(ensurePublicPlayerId).not.toHaveBeenCalled();
  expect(generateStoryUpdate).not.toHaveBeenCalled();
}

async function expectRefused(res: Response) {
  const raw = await res.text();
  expect(res.status).toBe(403);
  expect(JSON.parse(raw)).toEqual({ error: GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE });
  expectNoWrites();
  // Refusals log nothing, and nothing identifying is in the response.
  expect(logs.text()).toBe(JSON.stringify([[], [], [], []]));
  for (const secret of [PLAYER, CODE, TEAM, ...Object.values(P), 'example.test']) expect(raw).not.toContain(secret);
  return `${res.status} ${raw}`;
}

async function expectRedeemed(res: Response, redeemerId = P.redeemer) {
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, playerId: PLAYER });
  const insert = service.calls.find((c) => c.table === 'guardians' && c.op === 'insert');
  expect(insert?.payload).toMatchObject({ player_id: PLAYER, profile_id: redeemerId, created_via: 'guardian_invite', created_by: redeemerId });
  expect(service.calls.some((c) => c.table === 'player_invites' && c.op === 'update')).toBe(true);
}

const guardianOf = (profileId: string) => ({ player_id: PLAYER, profile_id: profileId });
const assignment = (profileId: string, teamId: string, state: Partial<{ ended_at: string; expires_at: string }> = {}) => ({
  team_id: teamId,
  profile_id: profileId,
  ended_at: state.ended_at ?? null,
  expires_at: state.expires_at ?? null,
});

const refusals: Record<string, () => Promise<Response>> = {
  // Only the creator rule can refuse these two: the purchaser's handoff
  // authority and an undetectable previous-team coach pass every other rule.
  'the redeemer created the invite (a purchaser redeeming their own recovery handoff)': () => {
    setup(
      {
        ...baseWorld({ created_by: P.purchaser }),
        guardians: [guardianOf(P.guardian)],
        cards: [{ player_id: PLAYER, order_id: ORDER }],
        orders: [{ id: ORDER, purchaser_email: 'fictional-buyer@example.test', payment_status: 'fulfilled' }],
      },
      { users: { [P.purchaser]: { email: 'fictional-buyer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' } } }
    );
    return post(P.purchaser);
  },
  'an active coach of the current team': () => {
    setup({ ...baseWorld({ created_by: P.guardian }), guardians: [guardianOf(P.guardian)], coach_team: [assignment(P.redeemer, TEAM)] });
    return post();
  },
  'an ended coach of the current team': () => {
    setup({ ...baseWorld({ created_by: P.guardian }), guardians: [guardianOf(P.guardian)], coach_team: [assignment(P.redeemer, TEAM, { ended_at: '2026-01-01T00:00:00Z' })] });
    return post();
  },
  'an expired coach of the current team': () => {
    setup({ ...baseWorld({ created_by: P.guardian }), guardians: [guardianOf(P.guardian)], coach_team: [assignment(P.redeemer, TEAM, { expires_at: '2026-01-01T00:00:00Z' })] });
    return post();
  },
  'a current-team coach whose assignment row is gone but is in the audit history': () => {
    setup({
      ...baseWorld({ created_by: P.guardian }),
      guardians: [guardianOf(P.guardian)],
      relationship_audit_events: [{ table_name: 'coach_team', event: 'DELETE', team_id: TEAM, player_id: null, profile_id: P.redeemer }],
    });
    return post();
  },
  'a current direct coach': () => {
    setup({ ...baseWorld({ created_by: P.guardian }), guardians: [guardianOf(P.guardian)], coach_players: [{ player_id: PLAYER, profile_id: P.redeemer }] });
    return post();
  },
  'a removed direct coach (audit history)': () => {
    setup({
      ...baseWorld({ created_by: P.guardian }),
      guardians: [guardianOf(P.guardian)],
      relationship_audit_events: [
        { table_name: 'coach_players', event: 'INSERT', team_id: null, player_id: PLAYER, profile_id: P.redeemer },
        { table_name: 'coach_players', event: 'DELETE', team_id: null, player_id: PLAYER, profile_id: P.redeemer },
      ],
    });
    return post();
  },
  'a coach-authority invite for a child who already has a guardian': () => {
    setup({ ...baseWorld({ created_by: P.coach }), guardians: [guardianOf(P.guardian)], coach_team: [assignment(P.coach, TEAM)] });
    return post();
  },
  'a deleted or unknown creator (treated as non-guardian) for a child who has a guardian': () => {
    setup({ ...baseWorld({ created_by: null }), guardians: [guardianOf(P.guardian)] });
    return post();
  },
  'a creator who is no longer a guardian, for a child who has a guardian': () => {
    setup({ ...baseWorld({ created_by: P.otherAdult }), guardians: [guardianOf(P.guardian)] });
    return post();
  },
  'a forged order id that does not match the child, for a child who has a guardian': () => {
    setup({ ...baseWorld({ created_by: null, order_id: OTHER_ORDER }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }] });
    return post();
  },
  'a purchaser-looking creator whose email is unverified, for a child who has a guardian': () => {
    setup(
      {
        ...baseWorld({ created_by: P.purchaser }),
        guardians: [guardianOf(P.guardian)],
        cards: [{ player_id: PLAYER, order_id: ORDER }],
        orders: [{ id: ORDER, purchaser_email: 'fictional-buyer@example.test', payment_status: 'fulfilled' }],
      },
      { users: { [P.purchaser]: { email: 'fictional-buyer@example.test', email_confirmed_at: null } } }
    );
    return post();
  },
  'a former previous-team coach redeeming their own invite (child has no guardian)': () => {
    setup({
      ...baseWorld({ created_by: P.formerCoach }),
      coach_team: [assignment(P.formerCoach, PREVIOUS_TEAM, { ended_at: '2026-01-01T00:00:00Z' })],
    });
    return post(P.formerCoach);
  },
  'a coach-authority invite handed to a former previous-team coach, for a child who has a guardian': () => {
    setup({
      ...baseWorld({ created_by: P.coach }),
      guardians: [guardianOf(P.guardian)],
      coach_team: [assignment(P.coach, TEAM), assignment(P.formerCoach, PREVIOUS_TEAM, { ended_at: '2026-01-01T00:00:00Z' })],
    });
    return post(P.formerCoach);
  },
};

describe('guardian invite redemption refuses coaches and self-redemption, before any write', () => {
  it.each(Object.keys(refusals))('%s: fixed 403, no writes, no notification, nothing logged', async (name) => {
    await expectRefused(await refusals[name]());
  });

  it('every refusal is the identical response', async () => {
    const seen = new Set<string>();
    for (const run of Object.values(refusals)) seen.add(await expectRefused(await run()));
    expect(seen.size).toBe(1);
  });
});

describe('legitimate guardian invites still redeem', () => {
  it('a current guardian invites an ordinary adult', async () => {
    setup({ ...baseWorld({ created_by: P.guardian }), guardians: [guardianOf(P.guardian)] });
    await expectRedeemed(await post());
  });

  it('a creator who is both guardian and team coach acts as the guardian of their own child', async () => {
    setup({ ...baseWorld({ created_by: P.dual }), guardians: [guardianOf(P.dual)], coach_team: [assignment(P.dual, TEAM)] });
    await expectRedeemed(await post());
  });

  it('an order invite whose order is this child\'s card (child already has a guardian)', async () => {
    setup({ ...baseWorld({ created_by: null, order_id: ORDER }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }] });
    await expectRedeemed(await post());
  });

  it('a recovery handoff from the verified purchaser of a fulfilled order (child already has a guardian)', async () => {
    setup(
      {
        ...baseWorld({ created_by: P.purchaser }),
        guardians: [guardianOf(P.guardian)],
        cards: [{ player_id: PLAYER, order_id: ORDER }],
        orders: [{ id: ORDER, purchaser_email: 'Fictional-Buyer@example.test', payment_status: 'fulfilled' }],
      },
      { users: { [P.purchaser]: { email: 'fictional-buyer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' } } }
    );
    await expectRedeemed(await post());
  });

  it('a coach invites the first guardian of a child with none, and a different non-coach account redeems it', async () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_team: [assignment(P.coach, TEAM)] });
    await expectRedeemed(await post());
  });

  it('a deleted creator\'s invite for a child with no guardian', async () => {
    setup({ ...baseWorld({ created_by: null }) });
    await expectRedeemed(await post());
  });

  it('documented boundary: a genuine guardian invites a former coach of a previous team', async () => {
    setup({
      ...baseWorld({ created_by: P.guardian }),
      guardians: [guardianOf(P.guardian)],
      coach_team: [assignment(P.formerCoach, PREVIOUS_TEAM, { ended_at: '2026-01-01T00:00:00Z' })],
    });
    await expectRedeemed(await post(P.formerCoach), P.formerCoach);
  });

  it('used and expired invites keep their existing answer', async () => {
    setup({ ...baseWorld({ created_by: P.guardian }), player_invites: [{ id: 'invite-1', code: CODE, used_at: '2026-01-01T00:00:00Z', expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER }] });
    let res = await post();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "This invite isn't valid or has expired" });
    setup({ ...baseWorld({ created_by: P.guardian }), player_invites: [{ id: 'invite-1', code: CODE, used_at: null, expires_at: '2020-01-01T00:00:00Z', player_id: PLAYER }] });
    res = await post();
    expect(res.status).toBe(400);
    expectNoWrites();
  });
});

describe('a failing eligibility read fails closed without database text', () => {
  const reads = ['players', 'coach_team', 'coach_players', 'relationship_audit_events', 'guardians', 'cards', 'orders'];
  it.each(reads)('a failing %s read is a fixed 500 with a code-only log and no writes', async (table) => {
    setup(
      {
        ...baseWorld({ created_by: P.purchaser, order_id: ORDER }),
        cards: [{ player_id: PLAYER, order_id: OTHER_ORDER }],
        orders: [{ id: OTHER_ORDER, purchaser_email: 'nobody@example.test', payment_status: 'fulfilled' }],
      },
      {
        users: { [P.purchaser]: { email: 'fictional-buyer@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' } },
        fail: (c) => (c.table === table && c.op === 'select' ? { error: sentinelError('XX000') } : undefined),
      }
    );
    const res = await post();
    const raw = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(raw)).toEqual({ error: 'Could not accept this invite. Please try again.' });
    expect(raw).not.toMatch(/SENTINEL|sentinel_secret|sentinel-value/);
    expect(logs.text()).not.toMatch(/SENTINEL|sentinel_secret|sentinel-value/);
    expectCodeOnlyLogs(logs, 'guardian invite redeem: eligibility', 'XX000');
    expectNoWrites();
  });

  it('a failing account lookup for the creator is a fixed 500 with a code-only log', async () => {
    setup({ ...baseWorld({ created_by: P.purchaser }) });
    service = createFakeSupabase({
      respond: (c) => (c.table === 'player_invites' ? { data: baseWorld({ created_by: P.purchaser }).player_invites[0] } : c.op === 'select' ? { data: [] } : {}),
      adminUser: () => ({ error: sentinelError('XX000') }),
    });
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/SENTINEL/);
    expect(logs.text()).not.toMatch(/SENTINEL|sentinel_secret/);
    expectCodeOnlyLogs(logs, 'guardian invite redeem: eligibility', 'XX000');
    expectNoWrites();
  });
});
