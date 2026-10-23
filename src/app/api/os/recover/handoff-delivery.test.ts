import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import { POST } from './route';

const PURCHASER = 'aaaaaaaa-0000-4000-8000-000000000001';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const CARD = 'eeeeeeee-0000-4000-8000-000000000005';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => service.client }));
const createGuardianInvite = vi.fn();
vi.mock('@/lib/create-guardian-invite', () => ({ createGuardianInvite: (...args: unknown[]) => createGuardianInvite(...args) }));
vi.mock('@/lib/claim-player', () => ({ claimPlayerForCard: vi.fn() }));
vi.mock('@/lib/relationship-writes', () => ({ ensureProfileRole: vi.fn() }));

beforeEach(() => {
  session = createFakeSupabase({ user: { id: PURCHASER, email: 'buyer@example.test' } });
  service = createFakeSupabase({
    respond: (c) =>
      c.table === 'cards'
        ? { data: { id: CARD, status: 'assigned', access_status: null, player_id: PLAYER, order_id: 'order-1', orders: { purchaser_email: 'buyer@example.test', payment_status: 'fulfilled' } } }
        : {},
  });
  createGuardianInvite.mockReset();
});

const handoff = () =>
  POST(new NextRequest('http://localhost/api/os/recover', { method: 'POST', body: JSON.stringify({ cardId: CARD, decision: 'handoff', handoffEmail: 'parent@example.test' }) }));

describe('POST /api/os/recover (handoff) — truthful delivery, and the purchaser never gets the code', () => {
  it('reports a confirmed delivery without the code', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'HANDOFF-CODE', reused: false, emailStatus: 'sent' });
    const res = await handoff();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, emailStatus: 'sent' });
    expect(JSON.stringify(body)).not.toContain('HANDOFF-CODE');
  });

  it('reports a failed email without the code (the purchaser retries; the invite is reused)', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'HANDOFF-CODE', reused: true, emailStatus: 'failed' });
    const body = await (await handoff()).json();
    expect(body).toEqual({ ok: true, emailStatus: 'failed' });
  });

  it('Gate 3.9: the handoff carries the verified card\'s own order as its provenance (trusted service-role write)', async () => {
    createGuardianInvite.mockResolvedValue({ ok: true, code: 'HANDOFF-CODE', reused: false, emailStatus: 'sent' });
    await handoff();
    expect(createGuardianInvite).toHaveBeenCalledWith(service.client, PLAYER, expect.any(String), 'parent@example.test', 'second_guardian', 'order-1');
  });
});
