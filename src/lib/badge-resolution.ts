export const CUSTOM_COLLECTION_BADGE_PLACEHOLDER = '/templates/custom-collection/custom-logo-placeholder.png';

/**
 * Approved product rule, not a bug (see playerBadge()'s own comment in
 * ProductionBuilder.tsx, and the Emblem PDF/OS parity investigation this
 * codifies): a badge-less Custom Collection card must never go to print
 * with an empty badge slot, so the Builder preview and print-capture path
 * fall back to this generic "Football Collection" placeholder. Emblem OS
 * reads card_definitions.logo directly and is never routed through this
 * fallback — a badge-less Custom Collection card correctly shows no badge
 * there. Never used for Official Collection, which always resolves to a
 * real licensed club badge.
 */
export function resolveCustomCollectionBadge(playerBadgeUrl?: string | null, orderBadgeUrl?: string | null): string {
  return playerBadgeUrl || orderBadgeUrl || CUSTOM_COLLECTION_BADGE_PLACEHOLDER;
}
