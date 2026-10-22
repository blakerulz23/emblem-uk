import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeSupabase, wroteTable } from '@/lib/fake-supabase.test-support';
import type { FakeResult } from '@/lib/fake-supabase.test-support';
import { ROSTER_ADD_DENIED_MESSAGE, ROSTER_ADD_FAILED_MESSAGE } from '@/lib/team-roster-permission';
import { POST } from './route';

let session: ReturnType<typeof createFakeSupabase>;
let service: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => session.client,
  createServiceRoleClient: () => service.client,
}));

const COACH = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const OTHER_TEAM = 'dddddddd-0000-4000-8000-000000000004';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';

// Raw database wording a client must never see.
const RLS_TEXT = 'new row violates row-level security policy for table "players"';
const FORBIDDEN_IN_RESPONSES = /row-level security|policy|violates|coach_team|"players"|relation |permission denied|SQLSTATE|42501|connection reset/i;

type Assignment = { team_id: string; ended_at: string | null; expires_at: string | null } | null;

function setup({
  assignment,
  assignmentError = null,
  insert = { data: { id: PLAYER } },
  card = { data: { id: 'card-1' } },
}: {
  assignment: Assignment;
  assignmentError?: FakeResult['error'];
  insert?: FakeResult;
  card?: FakeResult;
}) {
  session = createFakeSupabase({
    user: { id: COACH },
    respond: (c) => {
      if (c.table === 'coach_team' && c.op === 'select') {
        // The route asks only about this signed-in profile on the requested team.
        const team = c.filters.find(([, col]) => col === 'team_id')?.[2];
        const profile = c.filters.find(([, col]) => col === 'profile_id')?.[2];
        if (assignmentError) return { error: assignmentError };
        return { data: assignment && team === assignment.team_id && profile === COACH ? assignment : null };
      }
      if (c.table === 'players' && c.op === 'insert') return insert;
      return {};
    },
  });
  service = createFakeSupabase({ respond: (c) => (c.table === 'cards' ? card : {}) });
}

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/os/players', { method: 'POST', body: JSON.stringify(body) }));
const add = (teamId = TEAM) => post({ teamId, name: 'Fictional Player' });

const active: Assignment = { team_id: TEAM, ended_at: null, expires_at: null };
const ended: Assignment = { team_id: TEAM, ended_at: '2026-01-01T00:00:00Z', expires_at: null };
const expired: Assignment = { team_id: TEAM, ended_at: null, expires_at: '2026-01-01T00:00:00Z' };

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

async function expectDenied(res: Response) {
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body).toEqual({ error: ROSTER_ADD_DENIED_MESSAGE });
  expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_IN_RESPONSES);
}

describe('POST /api/os/players — adding a roster player needs an active team assignment', () => {
  it('an active team coach adds the player and gets the claim code', async () => {
    setup({ assignment: active });
    const res = await add();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.playerId).toBe(PLAYER);
    expect(typeof body.claimToken).toBe('string');
    expect(wroteTable(session.calls, 'players')).toBe(true);
    expect(wroteTable(service.calls, 'cards')).toBe(true);
  });

  it('a legacy assignment (no end, no expiry) is active', async () => {
    setup({ assignment: { team_id: TEAM, ended_at: null, expires_at: null } });
    expect((await add()).status).toBe(200);
  });

  it('an ended coach gets a clean 403 and nothing is written', async () => {
    setup({ assignment: ended });
    await expectDenied(await add());
    expect(wroteTable(session.calls, 'players')).toBe(false);
    expect(wroteTable(service.calls, 'cards')).toBe(false);
  });

  it('an expired coach gets a clean 403 and nothing is written', async () => {
    setup({ assignment: expired });
    await expectDenied(await add());
    expect(wroteTable(session.calls, 'players')).toBe(false);
  });

  it('a role-only coach (no assignment row at all) gets a clean 403', async () => {
    setup({ assignment: null });
    await expectDenied(await add());
    expect(wroteTable(session.calls, 'players')).toBe(false);
  });

  it('a direct-link-only coach (coach_players, no team assignment) gets a clean 403', async () => {
    // The route never consults coach_players: a direct link grants one player, never a team.
    setup({ assignment: null });
    await expectDenied(await add());
    expect(session.calls.some((c) => c.table === 'coach_players')).toBe(false);
  });

  it('an unrelated signed-in user gets a clean 403', async () => {
    setup({ assignment: null });
    await expectDenied(await add());
  });

  it('a forged request for another team is refused, even from an active coach of a different team', async () => {
    setup({ assignment: active });
    await expectDenied(await add(OTHER_TEAM));
    expect(wroteTable(session.calls, 'players')).toBe(false);
  });

  it('the check is relationship-based, not view-based: a dual account with an active assignment can add from any view', async () => {
    // The Parent/Coach view is a preference only; the request carries no view and the server ignores one.
    setup({ assignment: active });
    expect((await post({ teamId: TEAM, name: 'Fictional Player', view: 'parent' })).status).toBe(200);
  });

  it('a dual account whose coach assignment ended is refused', async () => {
    setup({ assignment: ended });
    await expectDenied(await post({ teamId: TEAM, name: 'Fictional Player', view: 'coach' }));
  });

  it('if RLS refuses the insert (the assignment ended mid-request) the response is the same clean 403, never the database text', async () => {
    setup({ assignment: active, insert: { error: { code: '42501', message: RLS_TEXT } } });
    await expectDenied(await add());
    expect(wroteTable(service.calls, 'cards')).toBe(false);
  });

  it('an RLS refusal reported without a code is still a clean 403', async () => {
    setup({ assignment: active, insert: { error: { message: RLS_TEXT } } });
    await expectDenied(await add());
  });

  it('a genuine database failure on insert stays 500, with a generic message, and logs only the error code', async () => {
    setup({ assignment: active, insert: { error: { code: '08006', message: 'connection reset by peer' } } });
    const res = await add();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: ROSTER_ADD_FAILED_MESSAGE });
    expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_IN_RESPONSES);
    expect(errorSpy).toHaveBeenCalledWith('Roster add: player insert failed', { code: '08006' });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('connection reset');
  });

  it('a failed assignment lookup is a 500, not a denial and not a write', async () => {
    setup({ assignment: active, assignmentError: { code: '08006', message: 'connection reset by peer' } });
    const res = await add();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: ROSTER_ADD_FAILED_MESSAGE });
    expect(wroteTable(session.calls, 'players')).toBe(false);
  });

  it('a failed claim-card insert is a 500 with a generic message', async () => {
    setup({ assignment: active, card: { error: { code: '23505', message: 'duplicate key value violates unique constraint "cards_claim_token_key"' } } });
    const res = await add();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not generate a claim code. Please try again.');
    expect(JSON.stringify(body)).not.toMatch(/duplicate key|cards_claim_token_key/);
  });

  it('requires sign-in', async () => {
    setup({ assignment: active });
    session = createFakeSupabase({ user: null });
    expect((await add()).status).toBe(401);
  });

  it('rejects a malformed team id before touching the database', async () => {
    setup({ assignment: active });
    const res = await post({ teamId: 'not-a-uuid', name: 'Fictional Player' });
    expect(res.status).toBe(400);
    expect(session.calls).toEqual([]);
  });
});
