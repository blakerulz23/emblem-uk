import { describe, expect, it } from 'vitest';
import { PLAYER_NAV_ITEMS, COACH_NAV_ITEMS } from './navItems';

describe('navItems — Player OS and Coach OS configurations stay isolated', () => {
  it('Player OS has exactly Home, Card, Collection, Profile — no coach-only or invented items', () => {
    expect(PLAYER_NAV_ITEMS.map((i) => i.key)).toEqual(['home', 'card', 'journey', 'profile']);
    expect(PLAYER_NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Card', 'Collection', 'Profile']);
  });

  it('Coach OS has exactly Home, Team, Celebrate, Verify, Profile — no player-only or invented items', () => {
    expect(COACH_NAV_ITEMS.map((i) => i.key)).toEqual(['home', 'team', 'celebrate', 'verify', 'profile']);
    expect(COACH_NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Team', 'Celebrate', 'Verify', 'Profile']);
  });

  it('neither config leaks the other role\'s destinations (Card/Collection never in Coach; Team/Celebrate/Verify never in Player)', () => {
    const playerKeys = new Set(PLAYER_NAV_ITEMS.map((i) => i.key));
    const coachKeys = new Set(COACH_NAV_ITEMS.map((i) => i.key));
    expect(coachKeys.has('card')).toBe(false);
    expect(coachKeys.has('journey')).toBe(false);
    expect(playerKeys.has('team')).toBe(false);
    expect(playerKeys.has('celebrate')).toBe(false);
    expect(playerKeys.has('verify')).toBe(false);
  });

  it('every item has a non-empty icon key (resolved against the shared ICN map at render time in OSBottomNavigation, not re-verified here — ICN lives in data.tsx, real JSX this project\'s JSX-free vitest config cannot import)', () => {
    for (const item of [...PLAYER_NAV_ITEMS, ...COACH_NAV_ITEMS]) {
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });
});
