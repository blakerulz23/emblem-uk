import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only reads for the staff Photo Day pages. Always called with the
 * service-role client, after the page's own staff permission check.
 */

export type PhotoDayRow = {
  id: string;
  status: string;
  scheduled_for: string;
  venue_label: string;
  photographer_name: string;
  max_photos: number;
  photographer_token_expires_at: string | null;
  coach_permissions_confirmed_at: string | null;
  coach_permissions_note: string | null;
  photos_delete_after: string;
};

export async function loadPhotoDay(service: SupabaseClient, campaignId: string): Promise<PhotoDayRow | null> {
  const { data } = await service.from('squad_invite_photo_days')
    .select('id,status,scheduled_for,venue_label,photographer_name,max_photos,photographer_token_expires_at,coach_permissions_confirmed_at,coach_permissions_note,photos_delete_after')
    .eq('campaign_id', campaignId).maybeSingle<PhotoDayRow>();
  return data ?? null;
}

/**
 * Participations whose parent has granted, and not withdrawn,
 * photo_day_photography. The same rule match_photo_day_photo enforces;
 * read here only to decide who staff are offered.
 */
export async function loadConsentedParticipationIds(service: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data } = await service.from('squad_invite_permissions').select('participation_id')
    .eq('campaign_id', campaignId).eq('purpose', 'photo_day_photography').eq('granted', true)
    .is('withdrawn_at', null).not('participation_id', 'is', null);
  return Array.from(new Set((data ?? []).map((r: { participation_id: string }) => r.participation_id)));
}

export async function countPhotoDayPhotos(service: SupabaseClient, photoDayId: string) {
  const [uploaded, matched] = await Promise.all([
    service.from('squad_invite_photo_day_photos').select('id', { count: 'exact', head: true }).eq('photo_day_id', photoDayId).is('deleted_at', null),
    service.from('squad_invite_photo_day_photos').select('id', { count: 'exact', head: true }).eq('photo_day_id', photoDayId).is('deleted_at', null).not('participation_id', 'is', null),
  ]);
  return { uploaded: uploaded.count ?? 0, matched: matched.count ?? 0 };
}
