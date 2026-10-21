import { describe, expect, it } from 'vitest';
import { activeCoachAssignments, isActiveCoachAssignment } from './coach-assignment';

const now = new Date('2026-10-21T12:00:00Z');

describe('active coach assignments (mirrors coach_assignment_is_active in 0088)', () => {
  it('a legacy row with no end and no expiry is active', () => {
    expect(isActiveCoachAssignment({ ended_at: null, expires_at: null }, now)).toBe(true);
    expect(isActiveCoachAssignment({}, now)).toBe(true);
  });

  it('a future expiry is active; a past or exact expiry is not', () => {
    expect(isActiveCoachAssignment({ expires_at: '2026-10-22T00:00:00Z' }, now)).toBe(true);
    expect(isActiveCoachAssignment({ expires_at: '2026-10-21T11:59:59Z' }, now)).toBe(false);
    expect(isActiveCoachAssignment({ expires_at: '2026-10-21T12:00:00Z' }, now)).toBe(false);
  });

  it('an ended row is not active, even before its expiry', () => {
    expect(isActiveCoachAssignment({ ended_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(isActiveCoachAssignment({ ended_at: '2026-10-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z' }, now)).toBe(false);
  });

  it('filters a list and tolerates null', () => {
    const rows = [
      { team_id: 'legacy', ended_at: null, expires_at: null },
      { team_id: 'ended', ended_at: '2026-10-01T00:00:00Z', expires_at: null },
      { team_id: 'expired', ended_at: null, expires_at: '2026-10-01T00:00:00Z' },
      { team_id: 'expiring', ended_at: null, expires_at: '2026-12-01T00:00:00Z' },
    ];
    expect(activeCoachAssignments(rows, now).map((r) => r.team_id)).toEqual(['legacy', 'expiring']);
    expect(activeCoachAssignments(null, now)).toEqual([]);
  });
});
