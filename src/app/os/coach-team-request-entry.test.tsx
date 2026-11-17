import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { canRequestTeam } from './team-request-entry';
import CoachProfile from './screens/CoachProfile';
import CoachHome from './screens/CoachHome';
import CoachTeamRequestCard from './screens/CoachTeamRequestCard';
import { OsDataProvider } from './OsDataContext';
import { DEMO_OS_DATA, type OsData } from './osData';
import type { OsActions } from './OsApp';
import type { TeamRequestSummary } from '@/lib/os-view';

const REAL_NO_TEAM: OsData = { ...DEMO_OS_DATA, mode: 'real', coachDisplayName: 'Test Coach', coachClub: null, coachTeamsManaged: [], squad: [], verifyQueue: [], coachActivity: [], moments: [] };
const REAL_WITH_TEAM: OsData = { ...REAL_NO_TEAM, coachClub: { name: 'Fictional FC', location: null }, coachTeamsManaged: [{ id: 't1', name: 'U10 Blues', playerCount: 3 }] as OsData['coachTeamsManaged'] };

const pending: TeamRequestSummary = { id: 'r1', status: 'pending', clubName: 'Fictional FC', teamName: 'U9 Reds', ageGroup: 'U9', decisionNote: null, createdAt: '2026-11-10T10:00:00Z' };
const rejected: TeamRequestSummary = { ...pending, status: 'rejected', decisionNote: 'Please use your club email' };

const base = { hasSession: true, demo: false, dataMode: 'real' as const, availableViews: ['coach' as const], coachTeamCount: 0 };

describe('canRequestTeam', () => {
  it('offers it to a coach-only account in the coach view with no active team (F2)', () => {
    expect(canRequestTeam({ ...base, view: 'coach' })).toBe(true);
  });
  it('offers it to a dual-role account in the coach view with no active team', () => {
    expect(canRequestTeam({ ...base, view: 'coach', availableViews: ['parent', 'coach'] })).toBe(true);
  });
  it('does not offer it to a coach who has an active team', () => {
    expect(canRequestTeam({ ...base, view: 'coach', coachTeamCount: 1 })).toBe(false);
  });
  it('keeps the existing parent-view entry (parent with no coach relationship) and hides it once they can coach', () => {
    expect(canRequestTeam({ ...base, view: 'parent', availableViews: ['parent'] })).toBe(true);
    expect(canRequestTeam({ ...base, view: 'parent', availableViews: ['parent', 'coach'] })).toBe(false);
  });
  it('never in demo, demo data, signed out, or with no resolved view', () => {
    expect(canRequestTeam({ ...base, view: 'coach', demo: true })).toBe(false);
    expect(canRequestTeam({ ...base, view: 'coach', dataMode: 'demo' })).toBe(false);
    expect(canRequestTeam({ ...base, view: 'coach', hasSession: false })).toBe(false);
    expect(canRequestTeam({ ...base, view: null })).toBe(false);
  });
});

const renderWith = (data: OsData, node: React.ReactNode) => renderToStaticMarkup(<OsDataProvider value={data}>{node}</OsDataProvider>);

describe('Coach Profile: no active team', () => {
  it('shows a "Request a team" action instead of a dead end', () => {
    const html = renderWith(REAL_NO_TEAM, <CoachProfile teamRequest={null} onRequestTeam={() => {}} />);
    expect(html).toContain('aria-label="Request a team"');
    expect(html).toContain('role="button"');
    expect(html).not.toContain('Create a team to start managing your roster');
  });

  it('shows the pending request instead of a new prompt', () => {
    const html = renderWith(REAL_NO_TEAM, <CoachProfile teamRequest={pending} onRequestTeam={() => {}} />);
    expect(html).toContain('Team request sent');
    expect(html).toContain('PENDING APPROVAL');
    expect(html).toContain('Fictional FC · U9 Reds · U9');
    expect(html).toContain('aria-label="View request"');
    expect(html).not.toContain('aria-label="Request a team"');
  });

  it('shows a rejected request with a way to see why and ask again', () => {
    const html = renderWith(REAL_NO_TEAM, <CoachProfile teamRequest={rejected} onRequestTeam={() => {}} />);
    expect(html).toContain('approve your team request');
    expect(html).toContain('aria-label="See details"');
  });

  it('lists teams, with no request card, when the coach has an active team', () => {
    const html = renderWith(REAL_WITH_TEAM, <CoachProfile teamRequest={pending} onRequestTeam={undefined} />);
    expect(html).toContain('U10 Blues');
    expect(html).not.toContain('coach-team-request');
  });

  it('demo coach profile is unchanged (sample teams, no request card)', () => {
    const html = renderWith(DEMO_OS_DATA, <CoachProfile />);
    expect(html).toContain('Westbrook Juniors U10');
    expect(html).not.toContain('coach-team-request');
  });
});

describe('Coach Home: no active team', () => {
  const actionsWith = (openTeamRequest?: () => void) => ({ openTeamRequest, openStoryUpdate: () => {} }) as unknown as OsActions;

  it('shows the request card on Home when the action is offered', () => {
    const html = renderWith(REAL_NO_TEAM, <CoachHome actions={actionsWith(() => {})} storyUpdates={[]} teamRequest={null} />);
    expect(html).toContain('aria-label="Request a team"');
  });

  it('shows pending state on Home', () => {
    const html = renderWith(REAL_NO_TEAM, <CoachHome actions={actionsWith(() => {})} storyUpdates={[]} teamRequest={pending} />);
    expect(html).toContain('Team request sent');
  });

  it('no card for a coach with an active team', () => {
    const html = renderWith(REAL_WITH_TEAM, <CoachHome actions={actionsWith(undefined)} storyUpdates={[]} teamRequest={null} />);
    expect(html).not.toContain('coach-team-request');
  });
});

describe('CoachTeamRequestCard', () => {
  it('its button opens the existing team-request flow', () => {
    const onOpen = vi.fn();
    const el = CoachTeamRequestCard({ request: null, onOpen }) as React.ReactElement<{ children: React.ReactNode[] }>;
    // Find the role=button child and invoke its click handler, as a tap would.
    const find = (node: unknown): { props: { role?: string; onClick?: () => void } } | null => {
      if (!node || typeof node !== 'object') return null;
      const n = node as { props?: { role?: string; children?: unknown } };
      if (n.props?.role === 'button') return n as { props: { role?: string; onClick?: () => void } };
      const kids = n.props?.children;
      for (const k of Array.isArray(kids) ? kids : [kids]) {
        const hit = find(k);
        if (hit) return hit;
      }
      return null;
    };
    find(el)?.props.onClick?.();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
