import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Approve may only verify an unverified moment (verified_at IS NULL), like
// reject. Re-approving an already-verified moment would overwrite who
// verified it, and for a moment whose verifier deleted their account
// (migration 0097) it would trip moments_verification_status_consistency.

type Call = [string, ...unknown[]];
let calls: Call[] = [];
let updated: { id: string; player_id: string; title: string } | null = null;
const storyUpdates: unknown[] = [];

function builder(table: string) {
  const b: Record<string, (...args: unknown[]) => unknown> = {};
  for (const m of ['update', 'delete', 'eq', 'is', 'select', 'in']) {
    b[m] = (...args: unknown[]) => {
      calls.push([`${table}.${m}`, ...args]);
      return b;
    };
  }
  b.maybeSingle = async () => (table === 'moments' ? { data: updated, error: null } : { data: null, error: null });
  b.then = (resolve: unknown) => (resolve as (v: unknown) => unknown)({ data: [], error: null });
  return b;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coach-1' } } }) },
    from: (table: string) => builder(table),
  }),
}));

vi.mock('@/lib/story-updates', () => ({
  generateStoryUpdate: async (u: unknown) => void storyUpdates.push(u),
}));

import { PATCH } from './route';

const req = (body: unknown) =>
  new NextRequest('https://emblem.cards/api/os/moments/verify', { method: 'PATCH', body: JSON.stringify(body) });

beforeEach(() => {
  calls = [];
  storyUpdates.length = 0;
  updated = { id: 'm-1', player_id: 'p-1', title: 'Hat-trick' };
});

describe('PATCH /api/os/moments/verify — approve', () => {
  it('only updates a moment that is not yet verified', async () => {
    const res = await PATCH(req({ momentId: 'm-1', decision: 'approve' }));
    expect(res.status).toBe(200);
    const update = calls.findIndex((c) => c[0] === 'moments.update');
    expect(update).toBeGreaterThanOrEqual(0);
    expect(calls).toContainEqual(['moments.eq', 'id', 'm-1']);
    expect(calls).toContainEqual(['moments.is', 'verified_at', null]);
    expect(storyUpdates).toHaveLength(1);
  });

  it('an already-verified moment (zero rows) is a 403, with no Story Update', async () => {
    updated = null;
    const res = await PATCH(req({ momentId: 'm-1', decision: 'approve' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('may already be verified');
    expect(storyUpdates).toHaveLength(0);
  });

  it('reject keeps its own verified_at IS NULL filter', async () => {
    await PATCH(req({ momentId: 'm-1', decision: 'reject' }));
    expect(calls).toContainEqual(['moments.delete']);
    expect(calls).toContainEqual(['moments.is', 'verified_at', null]);
  });
});
