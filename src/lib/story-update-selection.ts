import type { StoryUpdate } from '@/app/os/osData';

/**
 * Picks the single "What's New" story update to show for the player
 * currently selected on Home (?player=<id>) — never the guardian's newest
 * update across every claimed child.
 *
 * storyUpdates is fetched guardian-wide (recipient_profile_id = the signed-
 * in guardian, see src/lib/os-data.ts's getOsData) because the separate
 * "Story Updates" full-history overlay intentionally spans every claimed
 * child. This function is what narrows that shared, already newest-first
 * sorted list down to the one player currently on screen, so a Coach
 * Assessment (or any other event) about one child can never appear under a
 * sibling's identity. Matched by playerId only — never by name, since two
 * players can legitimately share a display name.
 */
export function selectNewestUnreadForPlayer(storyUpdates: StoryUpdate[], playerId: string | null): StoryUpdate | null {
  if (!playerId) return null;
  return storyUpdates.find((u) => !u.readAt && u.playerId === playerId) ?? null;
}
