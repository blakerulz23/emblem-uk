import { describe, expect, it } from 'vitest';
import { DEMO_OS_DATA, PUBLIC_DEMO_OS_DATA } from './osData';
import { MOMENTS, MOMENT_ORDER } from './data';
import { PLAYER_PROFILE } from './playerProfile';

describe('public /os/demo data', () => {
  it('keeps the shared fallback moment-free, so a real account never sees sample moments', () => {
    expect(DEMO_OS_DATA.moments).toEqual([]);
    expect(DEMO_OS_DATA.currentSeasonStatus).toBeNull();
  });

  it('gives the public demo every Collection moment, newest first, with matching Career Moment numbers', () => {
    const moments = PUBLIC_DEMO_OS_DATA.moments;
    expect(moments.map((m) => m.id)).toEqual([...MOMENT_ORDER].reverse().map((id) => `demo-${id}`));
    expect(moments.map((m) => m.careerOrdinal)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    for (const m of moments) {
      const fixture = MOMENTS[m.id.slice('demo-'.length)];
      expect(m.title).toBe(fixture.title);
      expect(m.seasonLabel).toBe(fixture.year);
      expect(m.occurredOn).toBe(fixture.occurredOn);
    }
    const dates = moments.map((m) => m.occurredOn as string);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("shows Home a latest moment and a populated 'This season', with no photos (the old match photos showed a real sponsor)", () => {
    const moments = PUBLIC_DEMO_OS_DATA.moments;
    expect(moments.length).toBeGreaterThan(0);
    expect(moments.every((m) => m.media.length === 0)).toBe(true);
    const thisSeason = moments.filter((m) => m.seasonLabel === PLAYER_PROFILE.season);
    expect(thisSeason.length).toBeGreaterThan(0);
    expect(PUBLIC_DEMO_OS_DATA.currentSeasonStatus).toBe('active');
    // Season ordinals count up within each season, newest highest.
    expect(thisSeason.map((m) => m.seasonOrdinal)).toEqual(thisSeason.map((_, i) => thisSeason.length - i));
  });

  it('only marks a family upload as a family memory', () => {
    for (const m of PUBLIC_DEMO_OS_DATA.moments) {
      expect(m.status).toBe(m.trust === 'parent' ? 'family_memory' : 'coach_verified');
    }
  });

  it("tells an outfield player's story, not a goalkeeper's", () => {
    expect(PLAYER_PROFILE.position).toBe('Striker');
    const text = JSON.stringify([MOMENTS, PUBLIC_DEMO_OS_DATA.goals]).toLowerCase();
    for (const keeperTerm of ['clean sheet', 'in goal', 'distribution', 'save from']) {
      expect(text).not.toContain(keeperTerm);
    }
  });

  it('gives match details only to moments that happened in a match', () => {
    expect(MOMENTS.e2.match).toBeUndefined(); // Team Photo
    expect(MOMENTS.e5.match).toBeUndefined(); // Captain
    expect(MOMENTS.e3.match?.competition).toBe('U10 Champions Cup');
  });
});

describe('public demo is fictional', () => {
  // The demo is shown publicly (/os/demo, and the clubs-page card portal).
  // These real-world names and marks must never come back into it.
  const banned = ['Rebecca Penny', 'Curzon Ashton', 'Hyde United', 'Denton FC', 'Greater Manchester FA', 'Trafford', 'E.N.J.', 'Ollie Harrison'];
  const bannedFiles = ['jn-firstgoal', 'jn-team-photo', 'jn-captain', 'jn-tournament', 'player-ollie', 'card-ollie'];

  it('contains no real people, clubs, organisations or sponsor marks', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(__dirname);
    const files = ['data.tsx', 'osData.ts', 'playerProfile.ts', 'overlays/MomentStage.tsx', 'screens/Card.tsx', 'screens/CoachHome.tsx', 'screens/CoachProfile.tsx', 'screens/CoachTeam.tsx', 'screens/Profile.tsx', 'screens/PlayerHome.tsx'];
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const term of [...banned, ...bannedFiles]) expect(text, `${f} contains ${term}`).not.toContain(term);
    }
  });

  it('shows the same fictional player as the clubs-page card', () => {
    expect(PLAYER_PROFILE.name).toBe('Riley Hart');
    expect(PLAYER_PROFILE.squadNumber).toBe(9);
  });
});
