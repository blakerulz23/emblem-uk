import type { SupabaseClient } from '@supabase/supabase-js';
import { generatePublicPlayerId, withUniqueCodeRetry } from '@/lib/claim-code';

/**
 * Generates and stores a player's permanent public_player_id the moment
 * they get their first-ever guardian — called from both first-claim
 * routes (POST /api/os/claim's card-token path and POST
 * /api/os/invites/redeem's no-card-recovery path), immediately after each
 * one's guardian insert succeeds. Never called lazily from a read path —
 * the public identity is a property of the claim transaction, not
 * something a later GET should be able to conjure.
 *
 * Idempotent: if the player already has one (e.g. a second guardian
 * joining via invite after the first guardian already claimed via card),
 * this is a no-op that just returns the existing value.
 */
export async function ensurePublicPlayerId(serviceRole: SupabaseClient, playerId: string): Promise<string | null> {
  const { data: existing } = await serviceRole
    .from('players')
    .select('public_player_id')
    .eq('id', playerId)
    .maybeSingle();

  if (existing?.public_player_id) {
    return existing.public_player_id;
  }

  const result = await withUniqueCodeRetry(
    (code) =>
      serviceRole
        .from('players')
        .update({ public_player_id: code })
        .eq('id', playerId)
        .is('public_player_id', null)
        .select('public_player_id')
        .single(),
    3,
    generatePublicPlayerId
  );

  return result.code;
}
