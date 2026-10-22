import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeResult } from '@/lib/fake-supabase.test-support';
import { captureLogs, expectCodeOnlyLogs, expectRedacted, sentinelError } from '@/lib/route-failure.test-support';
import { PATCH as cardStatus } from './cards/[id]/status/route';
import { POST as requestDeletion } from './players/[id]/deletion-request/route';
import { POST as cancelDeletion } from './players/[id]/deletion-request/cancel/route';

/**
 * Gate 3.5: the guardian account-control routes (card suspend/unsuspend,
 * child-deletion request and its cancellation) never return or log
 * database text. Each function's known refusal keeps a fixed status and
 * message; anything else is a generic 500 that logs only a fixed operation
 * name and a safe code. No card, player or profile id, email, reason or
 * request body is logged, a refusal makes no further call, and success is
 * unchanged.
 */
let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
const enqueue = vi.fn();
vi.mock('@/lib/dispatch-staff-notification', () => ({ enqueueAndDispatchStaffNotification: (...a: unknown[]) => enqueue(...a) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const EMAIL = 'guardian.person@example.test';
const CARD = 'bbbbbbbb-0000-4000-8000-000000000002';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const REQUEST_ID = 'dddddddd-0000-4000-8000-000000000004';

function signedIn(rpc: (fn: string, args: Record<string, unknown>) => FakeResult | undefined) {
  session = createFakeSupabase({ user: { id: USER, email: EMAIL }, rpc });
  service = createFakeSupabase({});
}
const patchCard = (body: unknown, id = CARD, raw?: string) =>
  cardStatus(new NextRequest(`http://localhost/api/os/cards/${id}/status`, { method: 'PATCH', body: raw ?? JSON.stringify(body) }), { params: { id } });
const postDeletion = (id = PLAYER) => requestDeletion(new NextRequest(`http://localhost/api/os/players/${id}/deletion-request`, { method: 'POST' }), { params: { id } });
const postCancel = (id = PLAYER) => cancelDeletion(new NextRequest(`http://localhost/api/os/players/${id}/deletion-request/cancel`, { method: 'POST' }), { params: { id } });
// Nothing identifying or personal may appear in any log line.
const nothingIdentifyingLogged = (logs: { text: () => string }, extra: string[] = []) => {
  for (const s of [USER, EMAIL, CARD, PLAYER, REQUEST_ID, ...extra]) expect(logs.text()).not.toContain(s);
};
// A refusal is the single function call and nothing else (the function raised, so PostgreSQL rolled back its own work).
const onlyTheOneCall = () => {
  expect(session.rpcCalls).toHaveLength(1);
  expect(session.calls).toHaveLength(0);
  expect(service.calls).toHaveLength(0);
  expect(enqueue).not.toHaveBeenCalled();
};

let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  enqueue.mockReset();
  logs = captureLogs();
});
afterEach(() => logs.restore());

describe('PATCH /api/os/cards/[id]/status — guardian suspend/unsuspend', () => {
  it('signed out is a fixed 401, with no call', async () => {
    session = createFakeSupabase({ user: null });
    await expectRedacted(await patchCard({ action: 'suspend' }), 401, 'Sign in required', logs);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['a body that is not JSON', null, CARD, '{nope', 'Invalid request'],
    ['a card id that is not an id', { action: 'suspend' }, "x' or 1=1", undefined, 'Invalid request'],
    ['an unknown action', { action: 'revoke' }, CARD, undefined, 'Invalid action'],
    ['an unsupported reason (user text, never echoed)', { action: 'suspend', reason: 'SENTINEL-USER-REASON free text' }, CARD, undefined, 'Invalid reason'],
    ['a non-text reason', { action: 'suspend', reason: { $ne: 1 } }, CARD, undefined, 'Invalid reason'],
  ])('validation: %s is a fixed 400 with no database call', async (_l, body, id, raw, message) => {
    signedIn(() => ({ error: sentinelError('P0001') }));
    const res = await patchCard(body, id as string, raw);
    await expectRedacted(res, 400, message, logs);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['the function\'s "Not authenticated"', 'Not authenticated', 401, 'Sign in required'],
    ['not this card\'s guardian (or no such card)', 'Not authorized to update this card', 403, "You don't have permission to change this card."],
    ['a permanently revoked card (a state conflict)', 'This card is permanently revoked and cannot be suspended', 409, 'This card has been permanently revoked and cannot be changed.'],
    ['the function\'s own reason check', 'Unsupported reason: SENTINEL-USER-REASON', 400, 'Invalid reason'],
  ])('%s is a fixed status with no database text, nothing logged and nothing else called', async (_l, raisedText, status, message) => {
    signedIn(() => ({ error: sentinelError('P0001', raisedText) }));
    await expectRedacted(await patchCard({ action: 'suspend', reason: 'lost' }), status, message, logs);
    onlyTheOneCall();
    nothingIdentifyingLogged(logs, ['lost']);
  });

  it('an unexpected failure is a generic 500, logged as the operation and code only (suspend and unsuspend)', async () => {
    signedIn(() => ({ error: sentinelError('40P01') }));
    await expectRedacted(await patchCard({ action: 'suspend', reason: 'stolen' }), 500, 'Could not update this card. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'card status: suspend', '40P01');
    signedIn(() => ({ error: sentinelError('08006') }));
    await expectRedacted(await patchCard({ action: 'unsuspend' }), 500, 'Could not update this card. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'card status: unsuspend', '08006');
    nothingIdentifyingLogged(logs, ['stolen']);
  });

  it('success is unchanged: 200 {ok:true}, the same function and arguments', async () => {
    signedIn(() => ({ data: null }));
    const s = await patchCard({ action: 'suspend', reason: 'lost' });
    expect(s.status).toBe(200);
    expect(await s.json()).toEqual({ ok: true });
    expect(session.rpcCalls).toEqual([{ fn: 'suspend_card', args: { p_card_id: CARD, p_reason: 'lost' } }]);
    signedIn(() => ({ data: null }));
    const n = await patchCard({ action: 'suspend' });
    expect(n.status).toBe(200);
    expect(session.rpcCalls).toEqual([{ fn: 'suspend_card', args: { p_card_id: CARD, p_reason: null } }]);
    signedIn(() => ({ data: null }));
    const u = await patchCard({ action: 'unsuspend' });
    expect(u.status).toBe(200);
    expect(await u.json()).toEqual({ ok: true });
    expect(session.rpcCalls).toEqual([{ fn: 'unsuspend_card', args: { p_card_id: CARD } }]);
    expect(logs.text()).toBe(JSON.stringify([[], [], [], []]));
  });
});

describe('POST /api/os/players/[id]/deletion-request — guardian child-deletion request', () => {
  it('signed out is 401 and a malformed player id a fixed 400, with no call', async () => {
    session = createFakeSupabase({ user: null });
    await expectRedacted(await postDeletion(), 401, 'Sign in required', logs);
    signedIn(() => ({ error: sentinelError('22P02') }));
    await expectRedacted(await postDeletion('not-an-id'), 400, 'Invalid request', logs);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['the function\'s "Not authenticated"', 'Not authenticated', 401, 'Sign in required'],
    ['not this child\'s guardian', 'Not authorized to request deletion for this player', 403, 'Only a guardian can request deletion for this player'],
  ])('%s is a fixed status; no request is filed and no staff notification is sent', async (_l, raisedText, status, message) => {
    signedIn(() => ({ error: sentinelError('P0001', raisedText) }));
    await expectRedacted(await postDeletion(), status, message, logs);
    onlyTheOneCall();
    nothingIdentifyingLogged(logs);
  });

  it('an unexpected failure is a generic 500 (was a 400 with database text), logged as the operation and code only', async () => {
    signedIn(() => ({ error: sentinelError('23503') }));
    await expectRedacted(await postDeletion(), 500, 'Could not send the deletion request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'player deletion request', '23503');
    onlyTheOneCall();
    nothingIdentifyingLogged(logs);
  });

  it('success is unchanged: 200 {ok, requestId}, the same function arguments, and the staff notification', async () => {
    signedIn(() => ({ data: REQUEST_ID }));
    const res = await postDeletion();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(session.rpcCalls).toEqual([{ fn: 'request_player_deletion', args: { p_player_id: PLAYER, p_requester_email: EMAIL, p_notes: null } }]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][1]).toEqual({
      eventType: 'deletion_request_filed', eventKey: `deletion_request_filed:${REQUEST_ID}`, subjectId: REQUEST_ID,
      recipientScope: 'all_staff', summary: { source: 'player' }, linkPath: '/staff/deletion-requests',
    });
  });
});

describe('POST /api/os/players/[id]/deletion-request/cancel — guardian cancellation', () => {
  it('signed out is 401 and a malformed player id a fixed 400, with no call', async () => {
    session = createFakeSupabase({ user: null });
    await expectRedacted(await postCancel(), 401, 'Sign in required', logs);
    signedIn(() => ({ error: sentinelError('22P02') }));
    await expectRedacted(await postCancel('not-an-id'), 400, 'Invalid request', logs);
    expect(session.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['the function\'s "Not authenticated"', 'Not authenticated', 401, 'Sign in required'],
    ['not this child\'s guardian', 'Not authorized to cancel a deletion request for this player', 403, 'Only a guardian can cancel this deletion request'],
    ['no pending request (the established 404)', 'No cancellable deletion request found for this player', 404, 'No pending deletion request to cancel'],
  ])('%s is a fixed status with no database text and nothing else called', async (_l, raisedText, status, message) => {
    signedIn(() => ({ error: sentinelError('P0001', raisedText) }));
    await expectRedacted(await postCancel(), status, message, logs);
    onlyTheOneCall();
    nothingIdentifyingLogged(logs);
  });

  it('an unexpected failure is a generic 500 (was a 400 with database text), logged as the operation and code only', async () => {
    signedIn(() => ({ error: sentinelError('40001') }));
    await expectRedacted(await postCancel(), 500, 'Could not cancel the deletion request. Please try again.', logs);
    expectCodeOnlyLogs(logs, 'player deletion request cancel', '40001');
    nothingIdentifyingLogged(logs);
  });

  it('success is unchanged: 200 {ok:true} and the same function arguments', async () => {
    signedIn(() => ({ data: true }));
    const res = await postCancel();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(session.rpcCalls).toEqual([{ fn: 'cancel_own_player_deletion_request', args: { p_player_id: PLAYER } }]);
  });
});
