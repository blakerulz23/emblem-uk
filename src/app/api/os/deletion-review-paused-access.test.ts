import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import { SENTINEL_TEXT } from '@/lib/route-failure.test-support';
import {
  COACH_ACCESS_PAUSED_MESSAGE,
  STAFF_COACH_ACCESS_PAUSED_MESSAGE,
  isDeletionReviewPending,
} from '@/lib/deletion-review';
import { POST as redeemCoachInvite } from './coach-invites/redeem/route';
import { POST as redeemTeamInvite } from './team-invites/redeem/route';
import { POST as submitTeamRequest } from './team-requests/route';
import { POST as approveTeamRequest } from '../staff/team-requests/[id]/approve/route';

/**
 * Migration 0098: while an account's deletion request awaits staff review,
 * the database grants it no coach access (proven against PostgreSQL in
 * supabase/tests/authz/migration_0098_test.mjs, sections 11–13). Here: each
 * route turns that refusal, whether a redeem status or the EMDRP error, into
 * a 409 with one fixed message, sends nothing else and leaks no database text.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));
const storyUpdates: unknown[] = [];
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: vi.fn(async (u) => void storyUpdates.push(u)) }));
vi.mock('@/lib/anonymous-request-rate-limit', () => ({ consumeAnonymousRequestRateLimit: async () => true }));
const notifications: unknown[] = [];
vi.mock('@/lib/dispatch-staff-notification', () => ({
  enqueueAndDispatchStaffNotification: vi.fn(async (_s: unknown, p: unknown) => {
    notifications.push(p);
    return { enqueued: true, sent: false };
  }),
}));
vi.mock('@/lib/require-staff', () => ({ requireStaff: async () => ({ ok: true, userId: STAFF }) }));
vi.mock('@/lib/season', () => ({ currentUkFootballSeason: () => '2026/27' }));
vi.mock('@/lib/resolve-season', () => ({ resolveOrCreateSeason: async () => ({ ok: true, id: 'season-1', label: '2026/27' }) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const STAFF = 'eeeeeeee-0000-4000-8000-000000000005';
const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';
// What PostgREST returns for the guards' raise (SQLSTATE EMDRP).
const EMDRP = { code: 'EMDRP', message: 'account_deletion_review_pending' };
const PAUSED_ROW = { data: [{ status: 'account_deletion_review_pending', player_id: null, team_id: null }] };

function setup(rpcResult: { data?: unknown; error?: { code?: string; message: string } }, insertResult?: { data?: unknown; error?: { code?: string; message: string } }) {
  storyUpdates.length = 0;
  notifications.length = 0;
  session = createFakeSupabase({
    user: { id: USER },
    respond: (c) => (c.table === 'coach_team_requests' && c.op === 'insert' ? insertResult : {}),
  });
  service = createFakeSupabase({
    respond: (c) => (c.table === 'teams' ? { data: { id: TEAM } } : {}),
    rpc: () => rpcResult,
  });
}
const req = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });

beforeEach(() => setup({}));

describe('the deletion-review refusal', () => {
  it('is recognised by SQLSTATE or message, and nothing else', () => {
    expect(isDeletionReviewPending(EMDRP)).toBe(true);
    expect(isDeletionReviewPending({ message: 'account_deletion_review_pending' })).toBe(true);
    expect(isDeletionReviewPending({ code: 'EMDRP', message: '' })).toBe(true);
    for (const e of [null, undefined, { code: 'EM409', message: 'team invite refused' }, { code: '23505', message: SENTINEL_TEXT }]) {
      expect(isDeletionReviewPending(e)).toBe(false);
    }
  });

  it('uses fixed, non-technical messages', () => {
    expect(COACH_ACCESS_PAUSED_MESSAGE).toBe('Your coach access is paused while your account deletion request is reviewed by Emblem staff.');
    expect(STAFF_COACH_ACCESS_PAUSED_MESSAGE).toBe(
      "This coach's account deletion request is under review, so their access is paused. Reject the deletion request first if they should keep coaching."
    );
    for (const m of [COACH_ACCESS_PAUSED_MESSAGE, STAFF_COACH_ACCESS_PAUSED_MESSAGE]) expect(m).not.toMatch(/EMDRP|_|pending_profile|coach_team|sql/i);
  });
});

describe.each([
  ['coach invite', () => redeemCoachInvite(req('/api/os/coach-invites/redeem', { inviteCode: 'COACH-1234' }))],
  ['team invite', () => redeemTeamInvite(req('/api/os/team-invites/redeem', { inviteCode: 'TEAM-1234' }))],
])('POST %s redeem while the account deletion is under review', (_name, call) => {
  it('the redeem status is a 409 with the paused message, no notification and no write of its own', async () => {
    setup(PAUSED_ROW);
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: COACH_ACCESS_PAUSED_MESSAGE });
    expect(storyUpdates).toHaveLength(0);
    for (const client of [session, service]) {
      for (const table of ['profiles', 'coach_team', 'coach_players', 'coach_invites', 'team_invites']) expect(wroteTable(client.calls, table)).toBe(false);
    }
    expect(service.rpcCalls).toHaveLength(1);
  });

  it('the guard error raised mid-call (a review that began meanwhile) is the same 409, with no database text', async () => {
    setup({ error: { ...EMDRP, message: `${EMDRP.message} ${SENTINEL_TEXT}` } });
    const res = await call();
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: COACH_ACCESS_PAUSED_MESSAGE });
    expect(text).not.toContain('SENTINEL');
    expect(storyUpdates).toHaveLength(0);
  });
});

describe('POST /api/os/team-requests while the account deletion is under review', () => {
  it('a refused insert is a 409 with the paused message, and staff are not notified', async () => {
    setup({}, { error: EMDRP });
    const res = await submitTeamRequest(req('/api/os/team-requests', { clubName: 'Fictional FC', teamName: 'U10' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: COACH_ACCESS_PAUSED_MESSAGE });
    expect(notifications).toHaveLength(0);
  });

  it('the existing duplicate-request 409 is unchanged', async () => {
    setup({}, { error: { code: '23505', message: SENTINEL_TEXT } });
    const res = await submitTeamRequest(req('/api/os/team-requests', { clubName: 'Fictional FC', teamName: 'U10' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'You already have a team request waiting for review' });
  });
});

describe('POST /api/staff/team-requests/[id]/approve while the coach’s account deletion is under review', () => {
  it.each([
    ['an existing team', { mode: 'existing', teamId: TEAM }],
    ['a new team', { mode: 'new' }],
  ])('approving into %s is a 409 with the staff message and no database text', async (_n, body) => {
    setup({ error: { ...EMDRP, message: `${EMDRP.message} ${SENTINEL_TEXT}` } });
    const res = await approveTeamRequest(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }), { params: { id: REQUEST_ID } });
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: STAFF_COACH_ACCESS_PAUSED_MESSAGE });
    expect(text).not.toContain('SENTINEL');
    expect(service.rpcCalls.map((c) => c.fn)).toEqual(['approve_coach_team_request']);
  });

  it('an already-decided request still gets its own 409', async () => {
    setup({ error: { message: 'This team request is already approved' } });
    const res = await approveTeamRequest(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ mode: 'existing', teamId: TEAM }) }), { params: { id: REQUEST_ID } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'This team request has already been decided' });
  });
});
