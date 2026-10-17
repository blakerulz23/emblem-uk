/**
 * Paths where analytics must never load or report: per-child or internal
 * surfaces. Shared by the GA helpers (analytics.ts) and the Vercel Web
 * Analytics filter (web-analytics.ts), so neither imports the other.
 */
const NO_ANALYTICS_PREFIXES = ['/os', '/card', '/player', '/staff', '/builder-approval', '/squad-invite/manage', '/dev', '/review'];

export function isAnalyticsBlockedPath(path: string): boolean {
  return NO_ANALYTICS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || (p === '/card' && path.startsWith('/card-')));
}
