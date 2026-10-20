/**
 * Paths where analytics must never load or report: per-child, guardian,
 * staff or internal surfaces. Shared by the GA helpers (analytics.ts) and the
 * Vercel Web Analytics filter (web-analytics.ts), so page views and custom
 * events always follow the same rule.
 *
 * Squad Invite is excluded as a whole (join links, payment pages, organiser
 * management, access) except its public landing page, /squad-invite/start,
 * which carries no tokens or family data.
 */
const NO_ANALYTICS_PREFIXES = ['/os', '/card', '/player', '/staff', '/builder-approval', '/squad-invite', '/dev', '/review', '/test-print'];
const PUBLIC_EXCEPTIONS = ['/squad-invite/start'];

export function isAnalyticsBlockedPath(path: string): boolean {
  if (PUBLIC_EXCEPTIONS.includes(path)) return false;
  return NO_ANALYTICS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || (p === '/card' && path.startsWith('/card-')));
}
