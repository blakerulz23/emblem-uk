import type { OsView } from '@/lib/os-view';

/**
 * Whether this signed-in account is offered "Request a team" (the existing
 * staff-approved coach_team_requests flow, TeamRequestOnboarding). Never a
 * permission: submitting a request grants nothing until staff approve it.
 *
 * - Parent view, no coach relationship at all: a parent asking to coach too
 *   (Profile → Account management), unchanged.
 * - Coach view with no ACTIVE team (coachTeamCount counts active coach_team
 *   assignments only, see getCoachOsData): a coach reached only through
 *   direct player links, or whose assignment ended or expired. Before this
 *   they saw "No teams yet" with no way forward (rollout finding F2).
 * - Never in the public demo or a signed-out session.
 */
export function canRequestTeam({
  hasSession,
  demo,
  dataMode,
  view,
  availableViews,
  coachTeamCount,
}: {
  hasSession: boolean;
  demo: boolean;
  dataMode: 'demo' | 'real';
  view: OsView | null;
  availableViews: OsView[];
  coachTeamCount: number;
}): boolean {
  if (!hasSession || demo || dataMode === 'demo') return false;
  if (view === 'parent') return !availableViews.includes('coach');
  if (view === 'coach') return coachTeamCount === 0;
  return false;
}
