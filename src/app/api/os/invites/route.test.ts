import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { POST } from './route';

let session: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client }));
const createGuardianInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...args: unknown[]) => createGuardianInvite(...args) }));

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/os/invites', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  session = createFakeSupabase({ user: { id: USER } });
  createGuardianInvite.mockReset();
});

describe('POST /api/os/invites — reports email delivery separately from the invite', () => {
  it('passes through a confirmed delivery', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'CODE-1', reused: false, emailStatus: 'sent' });
    const res = await post({ playerId: PLAYER, invitedEmail: 'parent@example.test' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: 'CODE-1', reused: false, emailStatus: 'sent' });
  });

  it('a created-but-not-emailed invite is still a success (the invite is usable), with emailStatus "failed"', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'CODE-1', reused: false, emailStatus: 'failed' });
    const res = await post({ playerId: PLAYER, invitedEmail: 'parent@example.test' });
    expect(res.status).toBe(200);
    expect((await res.json()).emailStatus).toBe('failed');
  });

  it('acts as the signed-in user: the session client, the session user as creator', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'CODE-1', reused: false, emailStatus: 'sent' });
    await post({ playerId: PLAYER, invitedEmail: 'parent@example.test', origin: 'coach_added_player' });
    expect(createGuardianInvite).toHaveBeenCalledWith(session.client, PLAYER, USER, 'parent@example.test', 'coach_added_player');
  });

  it('a failure returns the safe message and status, and no code', async () => {
    createGuardianInvite.mockResolvedValue({ ok: false, status: 403, error: "You don't have permission to invite a guardian for this player." });
    const res = await post({ playerId: PLAYER, invitedEmail: 'parent@example.test' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "You don't have permission to invite a guardian for this player." });
    expect(body).not.toHaveProperty('code');
  });

  it('resend with no pending emailed invite is a 400 and creates nothing', async () => {
    const res = await post({ playerId: PLAYER, resend: true });
    expect(res.status).toBe(400);
    expect(createGuardianInvite).not.toHaveBeenCalled();
  });

  it('requires sign-in', async () => {
    session = createFakeSupabase({ user: null });
    expect((await post({ playerId: PLAYER })).status).toBe(401);
    expect(createGuardianInvite).not.toHaveBeenCalled();
  });
});
