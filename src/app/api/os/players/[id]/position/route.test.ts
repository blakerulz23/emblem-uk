import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

/**
 * Covers the compatibility path added alongside the five-category position
 * simplification: a legacy player (players.position still holding an old
 * specific code like "CB", from before this change) must never be blocked
 * from re-saving that same value through this route — e.g. as a side
 * effect of some other field's own save going through the same endpoint —
 * while a genuinely *new* non-canonical value is still rejected. See
 * route.ts's own doc comment for why this needs one extra read rather than
 * validating the incoming value in isolation.
 */
const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const USER_ID = 'guardian-1';
const PLAYER_ID = 'player-1';

function patchRequest(position: string | undefined) {
  return PATCH(
    new NextRequest(`http://localhost/api/os/players/${PLAYER_ID}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ position }),
    }),
    { params: { id: PLAYER_ID } }
  );
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockMaybeSingle.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockRpc.mockResolvedValue({ data: false, error: null });
});

describe('PATCH /api/os/players/[id]/position — legacy compatibility', () => {
  it('resubmitting the exact same legacy value a player already has succeeds (no-op) rather than being rejected', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { position: 'CB' } });
    const res = await patchRequest('CB');
    expect(res.status).toBe(200);
    // The RPC IS still called — this is a real (if idempotent) write of the
    // same value, not a silently-skipped one; the point is it isn't 400'd.
    expect(mockRpc).toHaveBeenCalledWith('update_primary_position', { p_player_id: PLAYER_ID, p_position: 'CB' });
  });

  it('resubmitting the same legacy value works for any of the old specific codes (CAM, ST, etc), not just CB', async () => {
    for (const legacy of ['CAM', 'ST', 'CDM']) {
      mockMaybeSingle.mockResolvedValue({ data: { position: legacy } });
      const res = await patchRequest(legacy);
      expect(res.status).toBe(200);
    }
  });

  it('a genuinely new (never-stored) non-canonical value is still rejected — the compatibility exception never weakens validation for real new writes', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { position: 'CB' } });
    const res = await patchRequest('RB'); // different legacy code, not what's currently stored
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('an unrecognised value that does not match the stored one is rejected, not silently guessed into a category', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { position: 'CB' } });
    const res = await patchRequest('Sweeper');
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).not.toMatch(/all.?rounder/i);
  });

  it('a brand-new canonical value is accepted normally (the ordinary, non-legacy path is unaffected)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { position: 'CB' } });
    const res = await patchRequest('defender');
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('update_primary_position', { p_player_id: PLAYER_ID, p_position: 'defender' });
  });

  it('an already-canonical value never triggers the extra lookup at all — the read only happens on the path that would otherwise reject', async () => {
    const res = await patchRequest('midfielder');
    expect(res.status).toBe(200);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('still requires sign-in, unaffected by the compatibility path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await patchRequest('CB');
    expect(res.status).toBe(401);
  });

  it('still rejects a blank position outright, before any lookup', async () => {
    const res = await patchRequest('');
    expect(res.status).toBe(400);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});
