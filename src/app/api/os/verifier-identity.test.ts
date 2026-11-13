import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase } from '@/lib/fake-supabase.test-support';
import type { FakeCall } from '@/lib/fake-supabase.test-support';

/**
 * Migration 0098 makes the database refuse any signed-in write that names
 * someone other than the caller as a moment's verifier. These are the two
 * app writers of moments.verified_by (grep: only /api/os/celebrate and
 * /api/os/moments/verify). Both must take the verifier from the session,
 * never from the request body. Every verifier-looking field a client could
 * send is supplied here and must be ignored.
 */
const COACH = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const OTHER = 'bbbbbbbb-0000-4000-8000-0000000000c2';
const PLAYER = 'cccccccc-0000-4000-8000-0000000000p1';
const FORGED = { verified_by: OTHER, verifiedBy: OTHER, uploaded_by: OTHER, verifierId: OTHER, coachId: OTHER, userId: OTHER };

let session: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: () => session.client, createServiceRoleClient: () => session.client }));
vi.mock('@/lib/story-updates', () => ({ generateStoryUpdate: async () => {} }));

import { POST as celebrate } from './celebrate/route';
import { PATCH as verify } from './moments/verify/route';

beforeEach(() => {
  session = createFakeSupabase({
    user: { id: COACH },
    respond: (c: FakeCall) => {
      if (c.table === 'moments' && (c.op === 'insert' || c.op === 'update')) return { data: { id: 'm-1', player_id: PLAYER, title: 'Award' } };
      return { data: null };
    },
  });
});

const momentWrites = () => session.calls.filter((c) => c.table === 'moments' && (c.op === 'insert' || c.op === 'update'));

describe('the verifier is always the signed-in user', () => {
  it('celebrate ignores every verifier field in the body', async () => {
    const res = await celebrate(
      new NextRequest('https://emblem.cards/api/os/celebrate', { method: 'POST', body: JSON.stringify({ playerId: PLAYER, award: 'Man of the Match', ...FORGED }) }),
    );
    expect(res.status).toBe(200);
    const writes = momentWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ verified_by: COACH, uploaded_by: COACH });
    expect(JSON.stringify(writes[0].payload)).not.toContain(OTHER);
  });

  it('verify (approve) ignores every verifier field in the body', async () => {
    const res = await verify(
      new NextRequest('https://emblem.cards/api/os/moments/verify', { method: 'PATCH', body: JSON.stringify({ momentId: 'm-1', decision: 'approve', ...FORGED }) }),
    );
    expect(res.status).toBe(200);
    const writes = momentWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ verified_by: COACH, verification_status: 'coach_verified' });
    expect(JSON.stringify(writes[0].payload)).not.toContain(OTHER);
  });
});
