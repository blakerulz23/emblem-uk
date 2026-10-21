/**
 * Active coach assignments (migration 0088). A coach_team row grants coach
 * access only while it's active: not ended, and not past its expiry. Legacy
 * rows (both NULL) are active. This mirrors the database's own
 * coach_assignment_is_active(), which 0089's policies use; until 0089, RLS
 * doesn't filter ended rows, so every app read of coach_team selects these
 * columns and filters here.
 */
export const COACH_ASSIGNMENT_STATE_COLUMNS = 'ended_at, expires_at';

export type CoachAssignmentState = {
  ended_at?: string | null;
  expires_at?: string | null;
};

export function isActiveCoachAssignment(row: CoachAssignmentState, now: Date = new Date()): boolean {
  if (row.ended_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function activeCoachAssignments<T extends CoachAssignmentState>(rows: T[] | null | undefined, now: Date = new Date()): T[] {
  return (rows ?? []).filter((r) => isActiveCoachAssignment(r, now));
}
