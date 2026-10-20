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

  it("shows Home a latest moment with a photo and a populated 'This season'", () => {
    const moments = PUBLIC_DEMO_OS_DATA.moments;
    const featured = moments.find((m) => m.media.length > 0);
    expect(featured?.title).toBe('Tournament Winner');
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

  it("tells a midfielder's story, not a goalkeeper's", () => {
    expect(PLAYER_PROFILE.position).toBe('Midfielder');
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
