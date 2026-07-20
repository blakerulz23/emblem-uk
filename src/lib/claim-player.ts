import type { SupabaseClient } from '@supabase/supabase-js';

type ClaimResult = { ok: true; playerId: string } | { ok: false; status: number; error: string };

/**
 * The one operation behind claiming a player, regardless of how the card
 * was identified — a typed claim_token (the primary, card-first path) or a
 * verified purchaser email surfacing an eligible order (the no-card
 * fallback). Both entry points converge here rather than each
 * implementing their own guardian-link + card-lock logic: there is one
 * claim flow, just two ways to identify which card it's for.
 */
export async function claimPlayerForCard(
  serviceRole: SupabaseClient,
  card: { id: string; status: string; player_id: string | null },
  userId: string
): Promise<ClaimResult> {
  if (!card.player_id || card.status === 'claimed') {
    return { ok: false, status: 400, error: "This card isn't available to claim" };
  }

  const { error: guardianError } = await serviceRole
    .from('guardians')
    .insert({ player_id: card.player_id, profile_id: userId });

  if (guardianError) {
    if (guardianError.code === '23505') {
      return { ok: false, status: 409, error: "You've already claimed this player" };
    }
    return { ok: false, status: 500, error: guardianError.message };
  }

  const { error: cardUpdateError } = await serviceRole
    .from('cards')
    .update({ status: 'claimed' })
    .eq('id', card.id);
  if (cardUpdateError) {
    return { ok: false, status: 500, error: cardUpdateError.message };
  }

  return { ok: true, playerId: card.player_id };
}
