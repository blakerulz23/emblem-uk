/**
 * My Season feature flag: the contract only (Phase 0).
 *
 * Phase 0 has nothing to gate, so there is no table yet and nothing calls
 * getSeasonFeatureState(). The per-team state and the global kill switch
 * arrive as migration 0099_season_feature_states.sql at the start of
 * Phase 1; until then every team resolves to 'off'.
 *
 * - 'off'   (default) nothing Season-related is shown or accepted
 * - 'demo'  staff/test accounts on the team see the fixture, read-only
 * - 'pilot' real reads and writes for that team
 * - 'on'    general availability (not used during the pilot)
 *
 * Either kill switch forces every team to 'off' without deleting data:
 * the deploy-level env SEASON_FEATURE_KILL_SWITCH=true (needs a redeploy),
 * or the database kill switch (Phase 1, immediate). Unknown or missing
 * values resolve to 'off'.
 *
 * Server-only: reads process.env and, from Phase 1, the service-role client.
 */
export type SeasonFeatureState = 'off' | 'demo' | 'pilot' | 'on';

const STATES: readonly SeasonFeatureState[] = ['off', 'demo', 'pilot', 'on'];

export function isSeasonFeatureState(value: unknown): value is SeasonFeatureState {
  return typeof value === 'string' && (STATES as readonly string[]).includes(value);
}

/** The deploy-level kill switch: only the exact string 'true' engages it. */
export function isSeasonDeployKillSwitchOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEASON_FEATURE_KILL_SWITCH === 'true';
}

export function resolveSeasonFeatureState({
  deployKillSwitch,
  globalKillSwitch,
  teamState,
}: {
  deployKillSwitch: boolean;
  globalKillSwitch: boolean | null | undefined;
  teamState: unknown;
}): SeasonFeatureState {
  if (deployKillSwitch === true) return 'off';
  // Only an explicit `false` lets a team's state through. A missing or
  // unreadable global row is treated as killed: fail closed.
  if (globalKillSwitch !== false) return 'off';
  return isSeasonFeatureState(teamState) ? teamState : 'off';
}

/**
 * The Season state for one team. Phase 0: always 'off' (no table exists),
 * and the deploy kill switch is still honoured so the wiring is in place.
 */
export async function getSeasonFeatureState(teamId: string | null | undefined): Promise<SeasonFeatureState> {
  void teamId;
  return resolveSeasonFeatureState({
    deployKillSwitch: isSeasonDeployKillSwitchOn(),
    // No season_feature_global row exists until Phase 1's 0099.
    globalKillSwitch: null,
    teamState: null,
  });
}
