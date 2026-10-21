/**
 * Which Emblem OS experience a signed-in person sees.
 *
 * Access comes only from relationships: a guardians row makes the Parent
 * view available, an active coach assignment (or a direct coach_players
 * connection) makes the Coach view available. profiles.role is never
 * authorization. It's only the preferred view when someone has both and
 * hasn't picked one, and the onboarding hint when they have neither.
 *
 * The chosen view travels as ?view= or the emblem_os_view cookie. Both are
 * plain preferences: a requested view the person has no relationship for is
 * ignored, and every read behind either view is still decided by RLS.
 */
export type OsView = 'parent' | 'coach';

export const OS_VIEW_COOKIE = 'emblem_os_view';

export function parseOsView(value: unknown): OsView | null {
  return value === 'parent' || value === 'coach' ? value : null;
}

/** ?view= wins over the remembered cookie; anything else is ignored. */
export function requestedOsView(queryValue: unknown, cookieValue: unknown): OsView | null {
  return parseOsView(queryValue) ?? parseOsView(cookieValue);
}

/** Client side: remembers the view so refreshes and later visits keep it. A preference only. */
export function rememberOsView(view: OsView) {
  document.cookie = `${OS_VIEW_COOKIE}=${view}; path=/; max-age=31536000; samesite=lax`;
}

export type OsViewInput = {
  isGuardian: boolean;
  isCoach: boolean;
  profileRole: OsView | null;
  requested: OsView | null;
};

export type OsViewResult = {
  /** null: no relationship yet, so onboarding decides what to show. */
  view: OsView | null;
  availableViews: OsView[];
};

export function resolveOsView({ isGuardian, isCoach, profileRole, requested }: OsViewInput): OsViewResult {
  const availableViews: OsView[] = [];
  if (isGuardian) availableViews.push('parent');
  if (isCoach) availableViews.push('coach');

  if (requested && availableViews.includes(requested)) return { view: requested, availableViews };
  if (availableViews.length === 2) {
    return { view: profileRole && availableViews.includes(profileRole) ? profileRole : 'parent', availableViews };
  }
  return { view: availableViews[0] ?? null, availableViews };
}

export type TeamRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type TeamRequestSummary = {
  id: string;
  status: TeamRequestStatus;
  clubName: string;
  teamName: string;
  ageGroup: string | null;
  decisionNote: string | null;
  createdAt: string;
};

/** Mirrors coach_team_requests' own checks, so a bad request fails with a readable message first. */
export function validateTeamRequestInput(body: unknown):
  | { ok: true; value: { clubName: string; teamName: string; ageGroup: string | null; note: string | null } }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const clubName = text(b.clubName);
  const teamName = text(b.teamName);
  const ageGroup = text(b.ageGroup) || null;
  const note = text(b.note) || null;
  if (clubName.length < 2 || clubName.length > 120) return { ok: false, error: 'Club name must be between 2 and 120 characters' };
  if (teamName.length < 1 || teamName.length > 120) return { ok: false, error: 'Team name must be between 1 and 120 characters' };
  if (ageGroup && ageGroup.length > 40) return { ok: false, error: 'Age group must be 40 characters or fewer' };
  if (note && note.length > 1000) return { ok: false, error: 'Note must be 1000 characters or fewer' };
  return { ok: true, value: { clubName, teamName, ageGroup, note } };
}
