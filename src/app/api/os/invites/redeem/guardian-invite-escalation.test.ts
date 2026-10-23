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
const OTHER_PLAYER = id(101);
const TEAM = id(200);
const PREVIOUS_TEAM = id(201);
const ORDER = id(300);
const OTHER_ORDER = id(301);
const CODE = 'INV-FICT1234';
const REDEEMER_EMAIL = 'fictional-redeemer@example.test';
const BUYER_EMAIL = 'fictional-buyer@example.test';

type World = Record<string, Array<Record<string, unknown>>>;
type InviteFields = { created_by: string | null; order_id?: string | null; invited_email?: string | null; origin?: string };

function baseWorld(invite: InviteFields): World {
  return {
    player_invites: [{ id: 'invite-1', code: CODE, used_at: null, expires_at: '2999-01-01T00:00:00Z', player_id: PLAYER, order_id: null, invited_email: null, origin: 'second_guardian', ...invite }],
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
  // A verified account, so emailed invites to REDEEMER_EMAIL pass the recipient binding.
  const user = { id: redeemerId, email: REDEEMER_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' };
  session = createFakeSupabase({ user });
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
  // --- Gate 3.9 B1: a squad buyer who coaches the team gains nothing from the purchase ---
  'B1: the squad buyer who coaches the team sends an ordinary emailed invite to a second account, child has a guardian': () => {
    setup(squadBuyerWorld({ invited_email: REDEEMER_EMAIL }), { users: buyerUsers });
    return post();
  },
  'B1: the same buyer-coach invite as a link-only code': () => {
    setup(squadBuyerWorld({}), { users: buyerUsers });
    return post();
  },
  'B1: a single-card purchaser (not a coach) whose email matches, but the invite carries no trusted order id': () => {
    setup(
      {
        ...baseWorld({ created_by: P.purchaser, invited_email: REDEEMER_EMAIL }),
        guardians: [guardianOf(P.guardian)],
        cards: [{ player_id: PLAYER, order_id: ORDER }],
        orders: [{ id: ORDER, purchaser_email: BUYER_EMAIL, payment_status: 'fulfilled' }],
      },
      { users: buyerUsers }
    );
    return post();
  },
  'B1: a forged origin order_approval without a trusted order id': () => {
    setup({ ...squadBuyerWorld({ invited_email: REDEEMER_EMAIL, origin: 'order_approval' }) }, { users: buyerUsers });
    return post();
  },
  'B1: a deleted creator does not gain recovery authority from the purchaser email': () => {
    setup({ ...squadBuyerWorld({ created_by: null, invited_email: REDEEMER_EMAIL }) }, { users: buyerUsers });
    return post();
  },
  'B1: the squad order itself (more than one linked card) is not trusted order authority': () => {
    setup(squadBuyerWorld({ order_id: ORDER, invited_email: REDEEMER_EMAIL }), { users: buyerUsers });
    return post();
  },
  'B1: an order whose single card is another child\'s': () => {
    setup({ ...baseWorld({ created_by: null, order_id: ORDER, invited_email: REDEEMER_EMAIL }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: OTHER_PLAYER, order_id: ORDER }], orders: [fulfilled(ORDER)] });
    return post();
  },
  'B1: an arbitrary order id with no card at all': () => {
    setup({ ...baseWorld({ created_by: null, order_id: OTHER_ORDER, invited_email: REDEEMER_EMAIL }), guardians: [guardianOf(P.guardian)], orders: [fulfilled(OTHER_ORDER)] });
    return post();
  },
  'B1: a refunded single-card order is not trusted order authority': () => {
    setup({ ...baseWorld({ created_by: null, order_id: ORDER, invited_email: REDEEMER_EMAIL }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }], orders: [{ id: ORDER, payment_status: 'refunded' }] });
    return post();
  },
  'B1: a trusted order invite with no named recipient is not email-bound, so it is not trusted authority': () => {
    setup({ ...baseWorld({ created_by: null, order_id: ORDER }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }], orders: [fulfilled(ORDER)] });
    return post();
  },
  // --- Gate 3.9 N2: coach authority lives only as long as the assignment ---
  'N2: a coach-created first-guardian invite after staff ended that coach': () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_team: [assignment(P.coach, TEAM, { ended_at: '2026-01-01T00:00:00Z' })] });
    return post();
  },
  'N2: a coach-created first-guardian invite after that coach\'s assignment expired': () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_team: [assignment(P.coach, TEAM, { expires_at: '2026-01-01T00:00:00Z' })] });
    return post();
  },
  'N2: a first-guardian invite whose creator is only a direct coach (no team assignment)': () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_players: [{ player_id: PLAYER, profile_id: P.coach }] });
    return post();
  },
  'N2: a first-guardian invite whose creator coaches only a previous team': () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_team: [assignment(P.coach, PREVIOUS_TEAM)] });
    return post();
  },
  'N2: a deleted or unknown creator for a child with no guardian (no authority)': () => {
    setup({ ...baseWorld({ created_by: null }) });
    return post();
  },
};

/** The squad buyer is the team's active coach; the squad order holds this child's card and another's; the child has a guardian. */
function squadBuyerWorld(invite: Partial<InviteFields>): World {
  return {
    ...baseWorld({ created_by: P.coach, ...invite }),
    guardians: [guardianOf(P.guardian)],
    coach_team: [assignment(P.coach, TEAM)],
    cards: [{ player_id: PLAYER, order_id: ORDER }, { player_id: OTHER_PLAYER, order_id: ORDER }],
    orders: [{ id: ORDER, purchaser_email: BUYER_EMAIL, payment_status: 'fulfilled' }],
  };
}
const buyerUsers = { [P.coach]: { email: BUYER_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' }, [P.purchaser]: { email: BUYER_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' } };
function fulfilled(orderId: string) {
  return { id: orderId, purchaser_email: BUYER_EMAIL, payment_status: 'fulfilled' };
}

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

  it('a trusted order invite for this child\'s single-card fulfilled order, to its named recipient (child already has a guardian)', async () => {
    setup({ ...baseWorld({ created_by: null, order_id: ORDER, invited_email: REDEEMER_EMAIL, origin: 'order_approval' }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }], orders: [fulfilled(ORDER)] });
    await expectRedeemed(await post());
  });

  it('a trusted recovery handoff (the purchaser\'s invite carrying the card\'s single-card order) to its named recipient (child already has a guardian)', async () => {
    setup(
      { ...baseWorld({ created_by: P.purchaser, order_id: ORDER, invited_email: ` ${REDEEMER_EMAIL.toUpperCase()} ` }), guardians: [guardianOf(P.guardian)], cards: [{ player_id: PLAYER, order_id: ORDER }], orders: [fulfilled(ORDER)] },
      { users: buyerUsers }
    );
    await expectRedeemed(await post());
  });

  it('a trusted order invite is judged by its order, not by its creator\'s former coach status', async () => {
    setup({
      ...baseWorld({ created_by: P.purchaser, order_id: ORDER, invited_email: REDEEMER_EMAIL }),
      guardians: [guardianOf(P.guardian)],
      coach_team: [assignment(P.purchaser, TEAM, { ended_at: '2026-01-01T00:00:00Z' })],
      cards: [{ player_id: PLAYER, order_id: ORDER }],
      orders: [fulfilled(ORDER)],
    });
    await expectRedeemed(await post());
  });

  it('an active coach invites the first guardian of a child with none, and a different non-coach account redeems it', async () => {
    setup({ ...baseWorld({ created_by: P.coach }), coach_team: [assignment(P.coach, TEAM)] });
    await expectRedeemed(await post());
  });

  it('a guardian-created invite stays valid after that guardian stops coaching the team', async () => {
    setup({ ...baseWorld({ created_by: P.dual }), guardians: [guardianOf(P.dual)], coach_team: [assignment(P.dual, TEAM, { ended_at: '2026-01-01T00:00:00Z' })] });
    await expectRedeemed(await post());
  });

  it('an emailed invite to someone else is the same invalid response as an unknown code, before any write', async () => {
    setup({ ...baseWorld({ created_by: P.guardian, invited_email: 'someone-else@example.test' }), guardians: [guardianOf(P.guardian)] });
    const mismatch = await post();
    const mismatchBody = await mismatch.text();
    expectNoWrites();
    setup({ ...baseWorld({ created_by: P.guardian }), player_invites: [] });
    const unknown = await post();
    expect([mismatch.status, mismatchBody]).toEqual([unknown.status, await unknown.text()]);
    expect(mismatch.status).toBe(400);
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
    // An invite that reaches every read: not a guardian's, an order that is not this child's single card, no active coach creator.
    setup(
      {
        ...baseWorld({ created_by: P.purchaser, order_id: ORDER, invited_email: REDEEMER_EMAIL }),
        cards: [{ player_id: OTHER_PLAYER, order_id: ORDER }],
        orders: [fulfilled(ORDER)],
      },
      { fail: (c) => (c.table === table && c.op === 'select' ? { error: sentinelError('XX000') } : undefined) }
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

  it('eligibility never consults the creator\'s account email (purchaser-email matching grants nothing)', async () => {
    setup(squadBuyerWorld({ invited_email: REDEEMER_EMAIL }), { users: buyerUsers });
    service = createFakeSupabase({
      respond: (c) => {
        if (c.op !== 'select') return {};
        const rows = (squadBuyerWorld({ invited_email: REDEEMER_EMAIL })[c.table] ?? []).filter((r) => c.filters.every((flt) => matches(r, flt)));
        return ['player_invites', 'players', 'profiles'].includes(c.table) ? { data: rows[0] ?? null } : { data: rows };
      },
      adminUser: () => {
        throw new Error('the creator account must not be looked up');
      },
    });
    await expectRefused(await post());
  });
});
