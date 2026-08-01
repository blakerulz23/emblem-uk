import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * One row per visibility change, individual or bulk ("Unpublish All") —
 * shared by both the per-moment visibility route and the unpublish-all
 * route so the audit trail is consistent regardless of which one triggered
 * it. This codebase has zero database triggers by design (logic lives in
 * routes); the trail is written explicitly, immediately after the
 * moments.visibility update itself succeeds — never assumed, never
 * reconstructed after the fact.
 */
export async function logVisibilityChange(
  serviceRole: SupabaseClient,
  entry: { momentId: string; playerId: string; changedBy: string; previousVisibility: string; newVisibility: string }
): Promise<void> {
  await serviceRole.from('moment_visibility_changes').insert({
    moment_id: entry.momentId,
    player_id: entry.playerId,
    changed_by: entry.changedBy,
    previous_visibility: entry.previousVisibility,
    new_visibility: entry.newVisibility,
  });
}
