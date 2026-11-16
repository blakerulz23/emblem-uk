import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only reads for a parent's own view of Photo Day (phase 3).
 * Every function here is scoped to ONE participation the caller has
 * already proved they own; nothing here can return another child's data.
 */

export type PhotoDayDecision = 'granted' | 'declined' | 'withdrawn' | null;

export type ParentPhotoDayState = {
  scheduledFor: string;
  venueLabel: string;
  /** True only before any photo is uploaded (0106 refuses a grant afterwards). */
  canGrant: boolean;
  decision: PhotoDayDecision;
  /** Staff have released matched photos to parents. */
  published: boolean;
};

export const PHOTO_DAY_POLICY_VERSION = 'squad_invite_photo_day_v1';

type DayRow = { id: string; status: string; scheduled_for: string; venue_label: string; photos_deleted_at: string | null };

export async function loadParentPhotoDayState(
  service: SupabaseClient,
  participation: { id: string; campaign_id: string },
): Promise<ParentPhotoDayState | null> {
  const { data: day } = await service.from('squad_invite_photo_days')
    .select('id,status,scheduled_for,venue_label,photos_deleted_at')
    .eq('campaign_id', participation.campaign_id).maybeSingle<DayRow>();
  if (!day || day.status === 'cancelled' || day.photos_deleted_at) return null;
  const { data: permission } = await service.from('squad_invite_permissions')
    .select('granted,withdrawn_at')
    .eq('campaign_id', participation.campaign_id).eq('participation_id', participation.id)
    .eq('purpose', 'photo_day_photography').eq('policy_version', PHOTO_DAY_POLICY_VERSION)
    .maybeSingle<{ granted: boolean; withdrawn_at: string | null }>();
  const decision: PhotoDayDecision = !permission ? null
    : !permission.granted ? 'declined'
    : permission.withdrawn_at ? 'withdrawn'
    : 'granted';
  return {
    scheduledFor: day.scheduled_for,
    venueLabel: day.venue_label,
    canGrant: day.status === 'scheduled',
    decision,
    published: day.status === 'published',
  };
}

/**
 * The photo ids a parent may see: matched to THEIR participation, not
 * deleted, on a published, undeleted photo day, with consent still standing.
 * Ordered by upload time so the first one is a stable default.
 */
export async function loadOwnMatchedPhotoIds(service: SupabaseClient, participation: { id: string; campaign_id: string }): Promise<string[]> {
  const state = await loadParentPhotoDayState(service, participation);
  if (!state || !state.published || state.decision !== 'granted') return [];
  const { data } = await service.from('squad_invite_photo_day_photos').select('id')
    .eq('participation_id', participation.id).is('deleted_at', null)
    .order('uploaded_at', { ascending: true });
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
