import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';

/**
 * Server-only resolver for the founder-approved public share page
 * (migration 0085, back image added 0087). Always goes through
 * get_card_share_public_page, which re-verifies expiry and the linked
 * card's current access_status on every call — this function never
 * treats a page as available just because a row for the token exists.
 * Same short (15-minute) signed-URL pattern public-player-profile.ts
 * already established for public media: a fresh URL is generated on
 * every page load, never cached or stored, so it can't itself end up
 * embedded/cached somewhere outside our control for the full 7-day
 * window. backImageUrl is only present when the template that produced
 * this page actually has an approved back (card-face-registry.ts) — its
 * absence is not an error, just "this design has no back to show".
 */
export type CardSharePublicPageResult =
  | { available: true; imageUrl: string; backImageUrl?: string }
  | { available: false };

const PUBLIC_MEDIA_EXPIRY_SEC = 15 * 60;

export async function resolveCardSharePublicPage(token: string): Promise<CardSharePublicPageResult> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { available: false };

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('get_card_share_public_page', { p_token: token });
  if (error) {
    console.error('card-share-public-page: rpc failed', error.message);
    return { available: false };
  }

  const result = data as { available?: boolean; frontImageKey?: string; backImageKey?: string | null } | null;
  if (!result?.available || !result.frontImageKey) return { available: false };

  try {
    const imageUrl = await getSignedDownloadUrl(result.frontImageKey, PUBLIC_MEDIA_EXPIRY_SEC);
    if (!result.backImageKey) return { available: true, imageUrl };
    const backImageUrl = await getSignedDownloadUrl(result.backImageKey, PUBLIC_MEDIA_EXPIRY_SEC);
    return { available: true, imageUrl, backImageUrl };
  } catch (err) {
    console.error('card-share-public-page: could not sign image URL', err);
    return { available: false };
  }
}
