import { onActivateKey } from '../a11y';
import type { TeamRequestSummary } from '@/lib/os-view';

/**
 * The coach view's way forward when the coach has no active team: opens
 * the existing team-request flow (TeamRequestOnboarding, staff-approved
 * coach_team_requests). Shows the latest request's state so a coach who
 * already asked sees "waiting for approval" rather than a fresh prompt.
 * Presentational only — OsApp decides whether it's offered at all
 * (canRequestTeam) and owns the overlay.
 */
export default function CoachTeamRequestCard({ request, onOpen }: { request: TeamRequestSummary | null; onOpen: () => void }) {
  const pending = request?.status === 'pending';
  const rejected = request?.status === 'rejected';
  const title = pending ? 'Team request sent' : rejected ? 'We couldn’t approve your team request' : 'No active team';
  const body = pending
    ? `${request.clubName} · ${request.teamName}${request.ageGroup ? ` · ${request.ageGroup}` : ''}. Our team checks every request before a coach can see players. You’ll get access here once it’s approved.`
    : rejected
      ? `${request.clubName} · ${request.teamName}. See why, or send a new request.`
      : 'Tell us which team you coach and we’ll set it up. Got a team invite link from your club? Open it on this device instead.';
  const cta = pending ? 'View request' : rejected ? 'See details' : 'Request a team';

  return (
    <div data-testid="coach-team-request" style={{ textAlign: 'center', padding: '10px 0 16px' }}>
      {pending && (
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, letterSpacing: '.12em', fontSize: 11, color: '#E97435', marginBottom: 4 }}>PENDING APPROVAL</div>
      )}
      <div style={{ fontFamily: 'Roboto', fontWeight: 800, fontSize: 14, color: 'var(--os-ink)' }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#6B6357', margin: '4px auto 12px', maxWidth: 300 }}>{body}</div>
      <div
        role="button"
        tabIndex={0}
        aria-label={cta}
        onClick={onOpen}
        onKeyDown={onActivateKey(onOpen)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '9px 18px', borderRadius: 11,
          background: pending ? 'transparent' : '#E97435', border: pending ? '1px solid var(--os-border)' : 'none',
          color: pending ? 'var(--os-ink)' : '#0B0A09', fontFamily: 'Roboto', fontWeight: 800, fontSize: 13, cursor: 'pointer',
        }}
      >
        {cta}
      </div>
    </div>
  );
}
