import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall, FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError, SENTINEL_TEXT } from '@/lib/route-failure.test-support';
import { COACH_INVITE_DENIED_MESSAGE, COACH_INVITE_FAILED_MESSAGE } from '@/lib/create-coach-invite';
import { POST as createCoachInviteRoute } from './coach-invites/route';
import { POST as deleteAccount } from './account/delete/route';

/**
 * Gate 3.4: the coach-invite creation route and account deletion never
 * return or log database text. A refusal is a fixed status and message, an
 * unexpected failure a generic 500, and the log carries only a fixed
 * operation name and a safe code. No email, invite code, player or profile
 * id, or request body is logged.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
const sendCoachInviteEmail = vi.fn();
vi.mock('@/lib/send-coach-invite-email', () => ({ sendCoachInviteEmail: (...a: unknown[]) => sendCoachInviteEmail(...a) }));
const enqueue = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: (...a: unknown[]) => enqueue(...a) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const EMAIL = 'Coach.Person@Example.Test';
const post = (body: unknown, raw?: string) =>
  createCoachInviteRoute(new NextRequest('http://localhost/api/os/coach-invites', { method: 'POST', body: raw ?? JSON.stringify(body) }));

function coachDb(insert: (attempt: number) => FakeResult) {
  let attempt = 0;
  return createFakeSupabase({
    user: { id: USER, email: 'guardian@example.test' },
    respond: (c: FakeCall) => {
      if (c.table === 'coach_invites' && c.op === 'select') return { data: null };
      if (c.table === 'coach_invites' && c.op === 'insert') return insert(attempt++);
      if (c.table === 'players') return { data: { name: 'Fictional Player' } };
      if (c.table === 'profiles') return { data: { display_name: 'Fictional Guardian' } };
      return {};
    },
  });
}
const inserts = () => session.calls.filter((c) => c.table === 'coach_invites' && c.op === 'insert');
// What must never appear in any log: the address (as typed and normalised),
// the player and profile ids, and any invite code the fake handed out.
const neverLogged = (logs: { text: () => string }, codes: string[] = []) => {
  for (const s of [EMAIL, EMAIL.toLowerCase(), PLAYER, USER, ...codes]) expect(logs.text()).not.toContain(s);
};

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  sendCoachInviteEmail.mockReset();
  enqueue.mockReset();
  logs = captureLogs();
});
afterEach(() => logs.restore());

describe('POST /api/os/coach-invites — fixed responses, no database text', () => {
  it('an RLS refusal (not this player\'s guardian), by SQLSTATE, is a fixed 403 and is not logged with any text', async () => {
    session = coachDb(() => ({ error: sentinelError('42501') }));
    await expectRedacted(await post({ playerId: PLAYER, invitedEmail: EMAIL }), 403, COACH_INVITE_DENIED_MESSAGE, logs);
    expect(sendCoachInviteEmail).not.toHaveBeenCalled();
    neverLogged(logs);
  });

  it('an RLS refusal reported only in the message text is still the fixed 403', async () => {
    session = coachDb(() => ({ error: { message: `new row violates row-level security policy ${SENTINEL_TEXT}` } }));
    await expectRedacted(await post({ playerId: PLAYER, invitedEmail: EMAIL }), 403, COACH_INVITE_DENIED_MESSAGE, logs);
  });

  it('an unexpected database failure is a generic 500, logged as the operation and code only', async () => {
    session = coachDb(() => ({ error: sentinelError('08006') }));
    await expectRedacted(await post({ playerId: PLAYER, invitedEmail: EMAIL }), 500, COACH_INVITE_FAILED_MESSAGE, logs);
    expectCodeOnlyLogs(logs, 'coach invite: create', '08006');
    neverLogged(logs);
  });

  it('a code collision on every attempt is the same generic 500 (no constraint name)', async () => {
    session = coachDb(() => ({ error: sentinelError('23505') }));
    await expectRedacted(await post({ playerId: PLAYER }), 500, COACH_INVITE_FAILED_MESSAGE, logs);
    expect(inserts()).toHaveLength(3);
    expectCodeOnlyLogs(logs, 'coach invite: create', '23505');
  });

  it('an error with an unsafe code is logged as "unknown", never echoed', async () => {
    session = coachDb(() => ({ error: { code: `SENTINEL ${EMAIL}`, message: SENTINEL_TEXT } }));
    await expectRedacted(await post({ playerId: PLAYER, invitedEmail: EMAIL }), 500, COACH_INVITE_FAILED_MESSAGE, logs);
    expectCodeOnlyLogs(logs, 'coach invite: create', 'unknown');
    neverLogged(logs);
  });

  it.each([
    ['no playerId', { invitedEmail: EMAIL }, undefined, 'playerId is required'],
    ['a playerId that is not an id', { playerId: "x' or 1=1 --" }, undefined, 'playerId is required'],
    ['a non-text email', { playerId: PLAYER, invitedEmail: { $ne: 1 } }, undefined, 'Enter a valid email address'],
    ['an over-long email', { playerId: PLAYER, invitedEmail: `${'a'.repeat(320)}@example.test` }, undefined, 'Enter a valid email address'],
    ['a body that is not JSON', null, '{not json', 'Invalid request'],
  ])('validation: %s is a fixed 400, with no database call', async (_label, body, raw, message) => {
    session = coachDb(() => ({ error: sentinelError('22P02') }));
    await expectRedacted(await post(body, raw), 400, message, logs);
    expect(session.calls.filter((c) => c.table === 'coach_invites')).toHaveLength(0);
  });

  it('signed out is 401', async () => {
    session = createFakeSupabase({ user: null });
    await expectRedacted(await post({ playerId: PLAYER }), 401, 'Sign in required', logs);
  });

  it('success is unchanged: the code, its link, reused false and the email outcome; inserts the four guardian columns', async () => {
    session = coachDb(() => ({ data: { id: 'coach-invite-1' } }));
    sendCoachInviteEmail.mockResolvedValue({ ok: false });
    const res = await post({ playerId: PLAYER, invitedEmail: EMAIL });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, reused: false, emailStatus: 'failed' });
    expect(body.url).toBe(`${new URL(body.url).origin}/os?coachinvite=${encodeURIComponent(body.code)}`);
    const payload = inserts()[0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['code', 'created_by', 'invited_email', 'player_id']);
    expect(payload).toMatchObject({ player_id: PLAYER, created_by: USER, invited_email: EMAIL.toLowerCase(), code: body.code });
    neverLogged(logs, [body.code]);
  });
});

describe('sendCoachInviteEmail — provider failures are logged without their text', () => {
  it('logs only the status for a rejected send, and only the error name for a thrown one', async () => {
    const { sendCoachInviteEmail: realSend } = await vi.importActual<typeof import('@/lib/send-coach-invite-email')>('@/lib/send-coach-invite-email');
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(`{"message":"Invalid to: ${EMAIL} ${SENTINEL_TEXT}"}`, { status: 422 }));
    expect(await realSend(EMAIL, 'CODE-SENTINEL-1', { firstName: 'Fictional', lastInitial: 'P' }, 'Fictional Guardian')).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new Error(`connect failed for ${EMAIL} ${SENTINEL_TEXT}`));
    expect(await realSend(EMAIL, 'CODE-SENTINEL-2', { firstName: 'Fictional', lastInitial: 'P' }, 'Fictional Guardian')).toEqual({ ok: false });
    fetchMock.mockRestore();
    vi.unstubAllEnvs();
    expect(logs.text()).toContain(JSON.stringify(['Resend coach invite email failed', { status: 422 }]));
    expect(logs.text()).toContain(JSON.stringify(['Resend coach invite email threw', { name: 'Error' }]));
    expect(logs.text()).not.toMatch(/SENTINEL|sentinel_secret/);
    neverLogged(logs, ['CODE-SENTINEL-1', 'CODE-SENTINEL-2']);
  });
});

describe('POST /api/os/account/delete — fixed responses, no database text', () => {
  const recentUser = () => ({ id: USER, email: 'guardian@example.test', last_sign_in_at: new Date().toISOString() });
  function deletionDb(rpc: () => FakeResult) {
    session = createFakeSupabase({ user: recentUser() as never, rpc: (fn) => (fn === 'delete_own_guardian_account' ? rpc() : {}) });
    (session.client.auth as unknown as { signOut: () => Promise<{ error: null }> }).signOut = vi.fn(async () => ({ error: null }));
    service = createFakeSupabase({});
    (service.client as unknown as { auth: unknown }).auth = { admin: { deleteUser: vi.fn(async () => ({ error: null })) } };
  }

  it('the function\'s expected refusal (no session) is a fixed 401, with no database text', async () => {
    deletionDb(() => ({ error: sentinelError('P0001', 'Not authenticated') }));
    await expectRedacted(await deleteAccount(), 401, 'Sign in required', logs);
  });

  it('an unexpected database failure is a generic 500, logged as the operation and code only; nothing is deleted', async () => {
    deletionDb(() => ({ error: sentinelError('40P01') }));
    await expectRedacted(await deleteAccount(), 500, 'Could not delete your account. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'account deletion: cleanup', '40P01');
    expect((service.client as unknown as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }).auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(logs.text()).not.toContain(USER);
    expect(logs.text()).not.toContain('guardian@example.test');
  });

  it('the re-authentication requirement is unchanged (401 REAUTH_REQUIRED, no database call)', async () => {
    deletionDb(() => ({ error: sentinelError('P0001') }));
    (session.client.auth as unknown as { getUser: () => Promise<unknown> }).getUser = async () => ({ data: { user: { id: USER, last_sign_in_at: '2020-01-01T00:00:00Z' } } });
    const res = await deleteAccount();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('REAUTH_REQUIRED');
    expect(session.rpcCalls).toHaveLength(0);
  });

  it('a successful deletion is unchanged: 200, not partial, the function\'s result, the identity deleted', async () => {
    deletionDb(() => ({ data: { canDeleteIdentity: true, removedGuardianLinks: 1 } }));
    const res = await deleteAccount();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, partial: false, canDeleteIdentity: true, removedGuardianLinks: 1 });
    expect((service.client as unknown as { auth: { admin: { deleteUser: ReturnType<typeof vi.fn> } } }).auth.admin.deleteUser).toHaveBeenCalledWith(USER);
  });
});
