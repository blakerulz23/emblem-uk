import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from './fake-supabase.test-support';
import { getEligibleCoachProfileIds, resolvePlayerCapabilities } from './player-capabilities';

const PLAYER = 'cccccccc-0000-4000-8000-000000000003';
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';

function client(coachTeamRow: unknown, coachTeamRows: unknown[] = [], directRow: unknown = null) {
  return createFakeSupabase({
    respond: (c) => {
      if (c.table === 'players') return { data: { team_id: 'team-1' } };
      if (c.table === 'guardians') return { data: null };
      if (c.table === 'coach_team') return { data: c.filters.some(([, col]) => col === 'profile_id') ? coachTeamRow : coachTeamRows };
      // resolvePlayerCapabilities reads one row (player_id); getEligibleCoachProfileIds reads a list (profile_id).
      if (c.table === 'coach_players') return { data: c.columns === 'player_id' ? directRow : (directRow ?? []) };
      return {};
    },
  }).client;
}

describe('resolvePlayerCapabilities — coach access needs an active assignment', () => {
  it('an active (or legacy) team assignment is coach access', async () => {
    const caps = await resolvePlayerCapabilities(client({ team_id: 'team-1', ended_at: null, expires_at: null }) as never, PLAYER, USER);
    expect(caps.isCoach).toBe(true);
  });

  it('an ended assignment is not', async () => {
    const caps = await resolvePlayerCapabilities(client({ team_id: 'team-1', ended_at: '2026-01-01T00:00:00Z', expires_at: null }) as never, PLAYER, USER);
    expect(caps.isCoach).toBe(false);
  });

  it('an expired assignment is not', async () => {
    const caps = await resolvePlayerCapabilities(client({ team_id: 'team-1', ended_at: null, expires_at: '2026-01-01T00:00:00Z' }) as never, PLAYER, USER);
    expect(caps.isCoach).toBe(false);
  });

  it('a direct coach connection still counts, independent of team assignments', async () => {
    const caps = await resolvePlayerCapabilities(
      client({ team_id: 'team-1', ended_at: '2026-01-01T00:00:00Z', expires_at: null }, [], { player_id: PLAYER }) as never,
      PLAYER,
      USER
    );
    expect(caps.isCoach).toBe(true);
  });
});

describe('getEligibleCoachProfileIds — ended and expired coaches are not eligible', () => {
  it('keeps active team coaches and direct coaches only', async () => {
    const ids = await getEligibleCoachProfileIds(
      client(null, [
        { profile_id: 'coach-active', ended_at: null, expires_at: null },
        { profile_id: 'coach-ended', ended_at: '2026-01-01T00:00:00Z', expires_at: null },
        { profile_id: 'coach-expired', ended_at: null, expires_at: '2026-01-01T00:00:00Z' },
      ], [{ profile_id: 'coach-direct' }] as never) as never,
      PLAYER
    );
    expect(ids.sort()).toEqual(['coach-active', 'coach-direct']);
  });
});
