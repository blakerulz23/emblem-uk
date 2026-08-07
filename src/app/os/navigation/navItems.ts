import type { Tab } from '../types';

export type OsNavItem = {
  key: Tab;
  label: string;
  /** Key into ICN (src/app/os/data.tsx) — unchanged icon set, no new icons added. */
  icon: string;
};

/**
 * Player OS's permanent nav destinations (Collection OS Product
 * Specification v1.0 — Home / Card / Collection / Profile, frozen).
 * Extracted verbatim from OsApp.tsx's former inline tabDefs — same items,
 * same labels, same icons, same order. Owned here (not by the shared
 * OSBottomNavigation shell) so Player OS's information architecture stays
 * a Player OS decision.
 */
export const PLAYER_NAV_ITEMS: OsNavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'card', label: 'Card', icon: 'card' },
  { key: 'journey', label: 'Collection', icon: 'flag' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];

/**
 * Coach OS's existing nav destinations — extracted verbatim from OsApp.tsx's
 * former inline tabDefs, unchanged: labels, icons, routes (tab keys) and
 * order are exactly what Coach OS already had. Not a Player-nav
 * substitute — Coach OS never renders PLAYER_NAV_ITEMS and vice versa (see
 * OsApp.tsx's isCoach branch).
 */
export const COACH_NAV_ITEMS: OsNavItem[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'team', label: 'Team', icon: 'team' },
  { key: 'celebrate', label: 'Celebrate', icon: 'star' },
  { key: 'verify', label: 'Verify', icon: 'shield' },
  { key: 'profile', label: 'Profile', icon: 'user' },
];
