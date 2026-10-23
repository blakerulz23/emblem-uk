import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall } from '@/lib/fake-supabase.test-support';
import { captureLogs } from '@/lib/route-failure.test-support';
import { GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE, redeemerMatchesInvitedEmail } from '@/lib/guardian-invite-eligibility';
import { ensurePublicPlayerId } from '@/lib/public-player-id';
import { generateStoryUpdate } from '@/lib/story-updates';
import { sendInviteEmail } from '@/lib/send-invite-email';
import { GET as inviteLink } from './players/[id]/invite-link/route';
import { POST as redeem } from './invites/redeem/route';
import { POST as createInvite } from './invites/route';

/**
 * Gate 3.8: guardian-invite codes stay with the people they belong to.
 * - A coach gets back only an invite they created themselves: never a
 *   guardian's, order-approval or recovery-handoff code (invite-link,
 *   reuse on create, resend). 0091 enforces the same rule in the database
 *   (supabase/tests/authz/migration_0091_test.mjs).
 * - An invite sent to a named recipient can only be redeemed by that
 *   recipient's verified account; a mismatch looks exactly like an invalid
 *   invite and is decided before any write.
 * The worlds below are filtered by each query's own filters.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async () => undefined) }));
vi.mock('@/lib/public-player-id', () => ({ ensurePublicPlayerId: vi.fn(async () => undefined) }));
vi.mock('@/lib/player-capabilities', () => ({ getEligibleCoachProfileIds: vi.fn(async () => []) }));
vi.mock('@/lib/send-invite-email', () => ({ sendInviteEmail: vi.fn(async () => ({ ok: true })) }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P = { coach: id(1), guardian: id(2), purchaser: id(3), redeemer: id(4), otherCoach: id(5) };
const PLAYER = id(100);
const TEAM = id(200);
const ORDER = id(300);
const CODE = { own: 'OWN-CODE-1111', guardian: 'GUARDIAN-CODE-2222', order: 'ORDER-CODE-3333', handoff: 'HANDOFF-CODE-4444' };
const FUTURE = '2999-01-01T00:00:00Z';

type Row = Record<string, unknown>;
type World = Record<string, Row[]>;
function matches(row: Row, [kind, col, value]: [string, string, unknown]) {
  if (kind === 'eq') return row[col] === value;
  if (kind === 'in') return (value as unknown[]).includes(row[col]);
  if (kind === 'is') return row[col] === value;
  if (kind === 'gt') return String(row[col]) > String(value);
  if (kind === 'not') return true;
  return true;
}
const SINGLE = ['player_invites', 'players', 'profiles'];
function worldClient(world: World, opts: { user?: { id: string; email?: string | null; email_confirmed_at?: string | null } | null } = {}) {
  return createFakeSupabase({
    user: opts.user as never,
    respond: (c: FakeCall) => {
      if (c.op !== 'select') return c.op === 'insert' ? { data: { code: 'NEW-CODE-9999' } } : {};
      const rows = (world[c.table] ?? []).filter((r) => c.filters.every((f) => matches(r, f)));
      return SINGLE.includes(c.table) ? { data: rows[0] ?? null } : { data: rows };
    },
    rpc: (fn) => (fn === 'ensure_profile_role' ? { data: 'parent' } : {}),
    adminUser: () => ({ user: null }),
  });
}

const invite = (code: string, created_by: string | null, extra: Row = {}): Row => ({
  id: `invite-${code}`, code, player_id: PLAYER, created_by, used_at: null, expires_at: FUTURE, invited_email: null, origin: 'second_guardian', order_id: null, ...extra,
});
const teamInvites = (): Row[] => [
  invite(CODE.guardian, P.guardian, { invited_email: 'second-parent@example.test' }),
  invite(CODE.order, null, { origin: 'order_approval', order_id: ORDER, invited_email: 'buyer@example.test' }),
  invite(CODE.handoff, P.purchaser, { invited_email: 'right-parent@example.test' }),
];

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  logs = captureLogs();
  vi.mocked(ensurePublicPlayerId).mockClear();
  vi.mocked(generateStoryUpdate).mockClear();
  vi.mocked(sendInviteEmail).mockClear();
});
afterEach(() => logs.restore());

// --- invite-link -------------------------------------------------------------------
describe('GET /api/os/players/[id]/invite-link returns only the coach\'s own invite', () => {
  const coachWorld = (invites: Row[]): World => ({
    coach_team: [{ team_id: TEAM, profile_id: P.coach, ended_at: null, expires_at: null }],
    players: [{ id: PLAYER, team_id: TEAM }],
    player_invites: invites,
  });
  const get = () => inviteLink(new Request(`http://localhost/api/os/players/${PLAYER}/invite-link`), { params: { id: PLAYER } });

  it('never returns a guardian-, order- or recovery-created code (the coach has none of their own)', async () => {
    session = worldClient(coachWorld(teamInvites()), { user: { id: P.coach } });
    const res = await get();
    const raw = await res.text();
    expect(res.status).toBe(404);
    expect(JSON.parse(raw)).toEqual({ error: 'No live invite for this player' });
    for (const c of Object.values(CODE)) expect(raw).not.toContain(c);
  });

  it('returns the coach\'s own live invite, even when other people\'s invites exist', async () => {
    session = worldClient(coachWorld([...teamInvites(), invite(CODE.own, P.coach, { origin: 'coach_added_player' })]), { user: { id: P.coach } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: CODE.own });
  });

  it('asks only for invites created by the signed-in coach', async () => {
    session = worldClient(coachWorld([invite(CODE.own, P.coach)]), { user: { id: P.coach } });
    await get();
    const lookup = session.calls.find((c) => c.table === 'player_invites');
    expect(lookup?.filters).toContainEqual(['eq', 'created_by', P.coach]);
  });
});

// --- create (reuse) and resend ---------------------------------------------------------------
describe('POST /api/os/invites never hands back someone else\'s code', () => {
  const post = (body: unknown) => createInvite(new NextRequest('http://localhost/api/os/invites', { method: 'POST', body: JSON.stringify(body) }));

  it('reusing for the same email and origin returns only the caller\'s own invite, never a guardian\'s', async () => {
    session = worldClient({ player_invites: teamInvites() }, { user: { id: P.coach } });
    const res = await post({ playerId: PLAYER, invitedEmail: 'second-parent@example.test', origin: 'second_guardian' });
    const raw = await res.text();
    expect(res.status).toBe(200);
    expect(raw).not.toContain(CODE.guardian);
    const lookup = session.calls.find((c) => c.table === 'player_invites' && c.op === 'select');
    expect(lookup?.filters).toContainEqual(['eq', 'created_by', P.coach]);
    expect(session.calls.some((c) => c.table === 'player_invites' && c.op === 'insert')).toBe(true); // a new invite of the coach's own
  });

  it('resend finds only the caller\'s own pending invite', async () => {
    session = worldClient({ player_invites: teamInvites() }, { user: { id: P.coach } });
    const res = await post({ playerId: PLAYER, resend: true });
    const raw = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(raw)).toEqual({ error: 'No pending invite with an email to resend' });
    for (const c of Object.values(CODE)) expect(raw).not.toContain(c);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it('a guardian resending their own invite still works (reused, same code)', async () => {
    session = worldClient({ player_invites: teamInvites() }, { user: { id: P.guardian } });
    const res = await post({ playerId: PLAYER, resend: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, code: CODE.guardian, reused: true });
  });
});

// --- redemption email binding ------------------------------------------------------------------
describe('redemption of an emailed invite is bound to the recipient\'s verified email', () => {
  const VERIFIED = '2026-01-01T00:00:00Z';
  const world = (inv: Row, extra: World = {}): World => ({
    player_invites: [inv],
    players: [{ id: PLAYER, team_id: TEAM, name: 'Fictional Child' }],
    guardians: [{ player_id: PLAYER, profile_id: P.guardian }],
    coach_team: [],
    coach_players: [],
    relationship_audit_events: [],
    cards: [],
    orders: [],
    profiles: [],
    ...extra,
  });
  const post = (user: { id: string; email?: string | null; email_confirmed_at?: string | null }, code: string) => {
    session = createFakeSupabase({ user: user as never });
    return redeem(new NextRequest('http://localhost/api/os/invites/redeem', { method: 'POST', body: JSON.stringify({ inviteCode: code }) }));
  };
  function expectNoWrites() {
    expect(service.calls.filter((c) => c.op !== 'select')).toEqual([]);
    expect(session.calls.filter((c) => c.op !== 'select')).toEqual([]);
    expect(service.rpcCalls).toEqual([]);
    expect(ensurePublicPlayerId).not.toHaveBeenCalled();
    expect(generateStoryUpdate).not.toHaveBeenCalled();
  }
  const guardianInvite = (email: string | null) => invite('GUARD-INV-5555', P.guardian, { invited_email: email });

  it('the matching verified email redeems, ignoring case and surrounding whitespace', async () => {
    service = worldClient(world(guardianInvite('  Second-Parent@Example.TEST ')));
    const res = await post({ id: P.redeemer, email: 'second-parent@example.test', email_confirmed_at: VERIFIED }, 'GUARD-INV-5555');
    expect(res.status).toBe(200);
    expect(service.calls.some((c) => c.table === 'guardians' && c.op === 'insert')).toBe(true);
  });

  const refusals: Record<string, () => Promise<Response>> = {
    'a different verified email': () => {
      service = worldClient(world(guardianInvite('second-parent@example.test')));
      return post({ id: P.redeemer, email: 'someone-else@example.test', email_confirmed_at: VERIFIED }, 'GUARD-INV-5555');
    },
    'the right email, unverified': () => {
      service = worldClient(world(guardianInvite('second-parent@example.test')));
      return post({ id: P.redeemer, email: 'second-parent@example.test', email_confirmed_at: null }, 'GUARD-INV-5555');
    },
    'an account with no email': () => {
      service = worldClient(world(guardianInvite('second-parent@example.test')));
      return post({ id: P.redeemer, email: null, email_confirmed_at: VERIFIED }, 'GUARD-INV-5555');
    },
    'a coach-controlled account relaying an order invite': () => {
      service = worldClient(world(invite('ORDER-INV-6666', null, { origin: 'order_approval', order_id: ORDER, invited_email: 'buyer@example.test' }), { cards: [{ player_id: PLAYER, order_id: ORDER }] }));
      return post({ id: P.redeemer, email: 'coach-puppet@example.test', email_confirmed_at: VERIFIED }, 'ORDER-INV-6666');
    },
    'a coach-controlled account relaying a recovery handoff': () => {
      service = worldClient(world(invite('HANDOFF-INV-7777', P.purchaser, { invited_email: 'right-parent@example.test' })));
      return post({ id: P.redeemer, email: 'coach-puppet@example.test', email_confirmed_at: VERIFIED }, 'HANDOFF-INV-7777');
    },
  };

  it.each(Object.keys(refusals))('%s: the invalid-invite response, before any write, nothing logged', async (name) => {
    const res = await refusals[name]();
    const raw = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(raw)).toEqual({ error: "This invite isn't valid or has expired" });
    expectNoWrites();
    expect(logs.text()).toBe(JSON.stringify([[], [], [], []]));
    for (const s of ['example.test', PLAYER, P.guardian, P.purchaser, ORDER, 'INV-']) expect(raw).not.toContain(s);
  });

  it('an email mismatch is indistinguishable from an expired invite', async () => {
    const mismatch = await (await refusals['a different verified email']()).text();
    service = worldClient(world(invite('EXPIRED-INV-8888', P.guardian, { expires_at: '2020-01-01T00:00:00Z' })));
    const expired = await post({ id: P.redeemer, email: 'x@example.test', email_confirmed_at: VERIFIED }, 'EXPIRED-INV-8888');
    expect(expired.status).toBe(400);
    expect(await expired.text()).toBe(mismatch);
  });

  it('a link-only invite (no recipient email) keeps its documented behaviour', async () => {
    service = worldClient(world(guardianInvite(null)));
    const res = await post({ id: P.redeemer, email: 'anyone@example.test', email_confirmed_at: VERIFIED }, 'GUARD-INV-5555');
    expect(res.status).toBe(200);
  });

  it('the Gate 3.7 rules still apply to the matching recipient (a current-team coach is refused with the fixed 403)', async () => {
    service = worldClient(world(guardianInvite('coach@example.test'), { coach_team: [{ team_id: TEAM, profile_id: P.otherCoach, ended_at: null, expires_at: null }] }));
    const res = await post({ id: P.otherCoach, email: 'coach@example.test', email_confirmed_at: VERIFIED }, 'GUARD-INV-5555');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: GUARDIAN_INVITE_REDEEM_REFUSED_MESSAGE });
    expectNoWrites();
  });

  it('legitimate order and recovery redemptions by their verified recipients still work', async () => {
    service = worldClient(world(invite('ORDER-INV-6666', null, { origin: 'order_approval', order_id: ORDER, invited_email: 'buyer@example.test' }), { cards: [{ player_id: PLAYER, order_id: ORDER }] }));
    expect((await post({ id: P.redeemer, email: 'BUYER@example.test', email_confirmed_at: VERIFIED }, 'ORDER-INV-6666')).status).toBe(200);
    // Recovery handoff: the creator is the verified purchaser of this child's fulfilled order.
    service = createFakeSupabase({
      respond: (c: FakeCall) => {
        const w = world(invite('HANDOFF-INV-7777', P.purchaser, { invited_email: 'right-parent@example.test' }), {
          cards: [{ player_id: PLAYER, order_id: ORDER }],
          orders: [{ id: ORDER, purchaser_email: 'buyer@example.test', payment_status: 'fulfilled' }],
        });
        if (c.op !== 'select') return {};
        const rows = (w[c.table] ?? []).filter((r) => c.filters.every((f) => matches(r, f)));
        return SINGLE.includes(c.table) ? { data: rows[0] ?? null } : { data: rows };
      },
      rpc: (fn) => (fn === 'ensure_profile_role' ? { data: 'parent' } : {}),
      adminUser: (uid) => (uid === P.purchaser ? { user: { id: uid, email: 'buyer@example.test', email_confirmed_at: VERIFIED } } : { user: null }),
    });
    expect((await post({ id: P.redeemer, email: 'right-parent@example.test', email_confirmed_at: VERIFIED }, 'HANDOFF-INV-7777')).status).toBe(200);
  });
});

describe('redeemerMatchesInvitedEmail', () => {
  it('normalises case and whitespace, requires verification, and treats a blank recipient as link-only', () => {
    expect(redeemerMatchesInvitedEmail(' A@Example.test ', { email: 'a@example.TEST', email_confirmed_at: 'x' })).toBe(true);
    expect(redeemerMatchesInvitedEmail('a@example.test', { email: 'a@example.test', email_confirmed_at: null })).toBe(false);
    expect(redeemerMatchesInvitedEmail('a@example.test', { email: 'b@example.test', email_confirmed_at: 'x' })).toBe(false);
    expect(redeemerMatchesInvitedEmail('a@example.test', { email: '', email_confirmed_at: 'x' })).toBe(false);
    expect(redeemerMatchesInvitedEmail(null, { email: null })).toBe(true);
    expect(redeemerMatchesInvitedEmail('   ', { email: null })).toBe(true);
  });
});

describe('Team-screen invite status never carries another person\'s code (structural)', () => {
  const src = readFileSync('src/lib/os-data.ts', 'utf8');
  const read = src.slice(src.indexOf("from('player_invites')") - 200, src.indexOf("from('player_invites')") + 300);
  it('reads status through the service role, scoped to the coach\'s players, without the code', () => {
    expect(read).toContain('createServiceRoleClient()');
    expect(read).toContain(".select('player_id, expires_at, created_by')");
    expect(read).toContain(".in('player_id', playerIds)");
    expect(read).not.toMatch(/\bcode\b/);
  });
  it('offers Manage invite only for the coach\'s own live invite', () => {
    expect(src).toContain("hasManageableInvite: guardianStatus === 'pending' && ownLiveInvite.has(p.id)");
    expect(src).toContain('inv.created_by === userId');
  });
});
