import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from './fake-supabase.test-support';
import { canAddRosterPlayers, checkActiveTeamAssignment, isPermissionDenied } from './team-roster-permission';

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000002';
const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const ENDED = '2026-01-01T00:00:00Z';

describe('canAddRosterPlayers — the "+ Add Player" control', () => {
  it('shows for real Coach OS data that carries an active-assignment team', () => {
    expect(canAddRosterPlayers({ mode: 'real', teamId: TEAM })).toBe(true);
  });
  it('hides when there is no active-assignment team', () => {
    expect(canAddRosterPlayers({ mode: 'real', teamId: null })).toBe(false);
  });
  it('hides in demo mode', () => {
    expect(canAddRosterPlayers({ mode: 'demo', teamId: TEAM })).toBe(false);
  });
});

describe('checkActiveTeamAssignment', () => {
  const client = (row: unknown, error: { message: string } | null = null) =>
    createFakeSupabase({ respond: (c) => (c.table === 'coach_team' ? { data: row, error } : {}) });

  it('active, legacy, ended, expired, missing and failed lookups', async () => {
    const check = (row: unknown, error: { message: string } | null = null) => checkActiveTeamAssignment(client(row, error).client as never, TEAM, USER);
    expect(await check({ team_id: TEAM, ended_at: null, expires_at: '2999-01-01T00:00:00Z' })).toBe('active');
    expect(await check({ team_id: TEAM, ended_at: null, expires_at: null })).toBe('active');
    expect(await check({ team_id: TEAM, ended_at: ENDED, expires_at: null })).toBe('none');
    expect(await check({ team_id: TEAM, ended_at: null, expires_at: ENDED })).toBe('none');
    expect(await check(null)).toBe('none');
    expect(await check(null, { message: 'timeout' })).toBe('error');
  });

  it('asks only about this profile on this team, with the assignment state columns', async () => {
    const fake = client({ team_id: TEAM, ended_at: null, expires_at: null });
    await checkActiveTeamAssignment(fake.client as never, TEAM, USER);
    expect(fake.calls[0].columns).toBe('team_id, ended_at, expires_at');
    expect(fake.calls[0].filters).toEqual([['eq', 'team_id', TEAM], ['eq', 'profile_id', USER]]);
  });
});

describe('isPermissionDenied', () => {
  it('recognises RLS and privilege refusals only', () => {
    expect(isPermissionDenied({ code: '42501', message: 'x' })).toBe(true);
    expect(isPermissionDenied({ message: 'new row violates row-level security policy for table "players"' })).toBe(true);
    expect(isPermissionDenied({ message: 'permission denied for table players' })).toBe(true);
    expect(isPermissionDenied({ code: '08006', message: 'connection reset' })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
  });
});

// The capability above relies on Coach OS data setting teamId only from an
// active team assignment. This drives the real getOsData with a stand-in
// Supabase client to prove that for each kind of account.
let db: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => db.client,
  createServiceRoleClient: () => db.client,
}));

function account({ teamLinks = [] as unknown[], directLinks = [] as unknown[], guardianLinks = [] as unknown[] }) {
  db = createFakeSupabase({
    user: { id: USER },
    respond: (c) => {
      if (c.table === 'coach_team') return { data: teamLinks };
      if (c.table === 'coach_players') return { data: directLinks };
      if (c.table === 'guardians') return { data: guardianLinks };
      if (c.table === 'players') return { data: [] };
      return {};
    },
  });
}

describe('Coach OS data: teamId (and so "+ Add Player") comes only from an active team assignment', () => {
  let getOsData: typeof import('./os-data').getOsData;
  beforeAll(async () => {
    // Fictional values: os-data only checks that Supabase is configured.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fictional-anon-key');
    vi.resetModules();
    ({ getOsData } = await import('./os-data'));
  });
  afterAll(() => vi.unstubAllEnvs());

  const teamRow = (state: { ended_at: string | null; expires_at: string | null }) => ({ team_id: TEAM, ...state, teams: { name: 'U10', clubs: { name: 'Fictional FC', badge_url: null } } });
  const coachView = async () => {
    const data = await getOsData(USER, 'coach');
    return { teamId: data.teamId, canAdd: canAddRosterPlayers(data) };
  };

  it('active team coach: control shown', async () => {
    account({ teamLinks: [teamRow({ ended_at: null, expires_at: null })] });
    expect(await coachView()).toEqual({ teamId: TEAM, canAdd: true });
  });

  it('ended coach: hidden, even though the coach view still opens for a direct link', async () => {
    account({ teamLinks: [teamRow({ ended_at: ENDED, expires_at: null })], directLinks: [{ player_id: PLAYER }] });
    expect(await coachView()).toEqual({ teamId: null, canAdd: false });
  });

  it('expired coach: hidden', async () => {
    account({ teamLinks: [teamRow({ ended_at: null, expires_at: ENDED })] });
    expect(await coachView()).toEqual({ teamId: null, canAdd: false });
  });

  it('direct-link-only coach: hidden', async () => {
    account({ directLinks: [{ player_id: PLAYER }] });
    expect(await coachView()).toEqual({ teamId: null, canAdd: false });
  });

  it('role-only coach (no relationship rows at all): hidden', async () => {
    account({});
    expect(await coachView()).toEqual({ teamId: null, canAdd: false });
  });

  it('dual parent/coach account: shown in the Coach view, never in the Parent view', async () => {
    account({ teamLinks: [teamRow({ ended_at: null, expires_at: null })], guardianLinks: [{ player_id: PLAYER }] });
    expect(await coachView()).toEqual({ teamId: TEAM, canAdd: true });
    const parent = await getOsData(USER, 'parent');
    expect(parent.teamId).toBeNull();
    expect(canAddRosterPlayers(parent)).toBe(false);
  });
});
