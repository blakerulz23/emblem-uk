import { createServiceRoleClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/s3-client';

/**
 * The public profile's explicit field allowlist. This file is deliberately
 * kept separate from src/lib/os-data.ts (the much larger private/
 * authenticated fetch layer) so the allowlist stays visually auditable in
 * one place, and deliberately never relaxes any RLS SELECT policy — every
 * query here runs via the service-role client, with this file's own field
 * selection as the only boundary. Anything not explicitly listed below
 * (age, height, preferred_foot, favourite_player, football_ambition,
 * guardians, assessments, season focus, strengths, claim_token) never
 * reaches this function's return value at all.
 *
 * Public signed media URLs use a short expiry (15 min, not the 7-day
 * ceiling used for authenticated staff/guardian contexts) — a public page's
 * signed URLs are more likely to end up cached, shared, or embedded
 * somewhere outside our control.
 */
const PUBLIC_MEDIA_EXPIRY_SEC = 15 * 60;

/**
 * A single failed signing call (misconfiguration, transient S3 issue) must
 * never take down the whole public profile — degrade to no image for that
 * one item rather than a hard crash. Logged, not swallowed silently.
 */
async function signOrNull(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  try {
    return await getSignedDownloadUrl(key, PUBLIC_MEDIA_EXPIRY_SEC);
  } catch (err) {
    console.error('public-player-profile: could not sign media URL', err);
    return null;
  }
}

export type PublicMoment = {
  id: string;
  title: string;
  occurredOn: string | null;
  note: string | null;
  media: { id: string; kind: string; url: string }[];
};

export type PublicPlayerProfile = {
  publicPlayerId: string;
  playerId: string; // internal id — used only for server-side capability resolution, never rendered/returned to a client caller beyond this module's own use
  name: string;
  position: string | null;
  secondaryPosition: string | null;
  squadNumber: number | null;
  photoUrl: string | null;
  team: { name: string; season: string | null } | null;
  club: { name: string; badgeUrl: string | null } | null;
  card: {
    templateId: string;
    logo: string | null;
    photoUrl: string | null;
    stats: Record<string, string> | null;
  } | null;
  moments: PublicMoment[];
};

export type PublicPlayerLookupResult =
  | { ok: true; profile: PublicPlayerProfile }
  | { ok: false; reason: 'not_found' | 'disabled' };

export async function getPublicPlayerProfile(publicPlayerId: string): Promise<PublicPlayerLookupResult> {
  const serviceRole = createServiceRoleClient();

  const { data: player } = await serviceRole
    .from('players')
    .select(
      `id, name, "position", secondary_position, squad_number, photo_key, public_id_enabled,
       teams ( name, seasons ( label ), clubs ( name, badge_url ) )`
    )
    .eq('public_player_id', publicPlayerId)
    .maybeSingle<{
      id: string;
      name: string;
      position: string | null;
      secondary_position: string | null;
      squad_number: number | null;
      photo_key: string | null;
      public_id_enabled: boolean;
      teams: { name: string; seasons: { label: string } | null; clubs: { name: string; badge_url: string | null } | null } | null;
    }>();

  if (!player) {
    return { ok: false, reason: 'not_found' };
  }
  if (!player.public_id_enabled) {
    return { ok: false, reason: 'disabled' };
  }

  const [{ data: cardDefinition }, { data: moments }] = await Promise.all([
    serviceRole
      .from('card_definitions')
      .select('template_id, logo, photo, stats')
      .eq('player_id', player.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ template_id: string; logo: string | null; photo: { storageKey?: string } | null; stats: Record<string, string> | null }>(),
    serviceRole
      .from('moments')
      .select('id, title, occurred_on, note, moment_media ( id, s3_key, kind )')
      .eq('player_id', player.id)
      .eq('visibility', 'public')
      .order('occurred_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ]);

  const [photoUrl, cardPhotoUrl] = await Promise.all([signOrNull(player.photo_key), signOrNull(cardDefinition?.photo?.storageKey)]);

  const momentRows =
    (moments as unknown as Array<{
      id: string;
      title: string;
      occurred_on: string | null;
      note: string | null;
      moment_media: { id: string; s3_key: string; kind: string }[];
    }>) ?? [];

  const publicMoments: PublicMoment[] = await Promise.all(
    momentRows.map(async (m) => ({
      id: m.id,
      title: m.title,
      occurredOn: m.occurred_on,
      note: m.note,
      // A photo/video whose signing fails is dropped from this moment's
      // media list rather than crashing the whole profile — same
      // reasoning as signOrNull above.
      media: (
        await Promise.all(
          (m.moment_media ?? []).map(async (media) => ({
            id: media.id,
            kind: media.kind,
            url: await signOrNull(media.s3_key),
          }))
        )
      ).filter((media): media is { id: string; kind: string; url: string } => media.url !== null),
    }))
  );

  return {
    ok: true,
    profile: {
      publicPlayerId,
      playerId: player.id,
      name: player.name,
      position: player.position,
      secondaryPosition: player.secondary_position,
      squadNumber: player.squad_number,
      photoUrl,
      team: player.teams ? { name: player.teams.name, season: player.teams.seasons?.label ?? null } : null,
      club: player.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
      card: cardDefinition
        ? { templateId: cardDefinition.template_id, logo: cardDefinition.logo, photoUrl: cardPhotoUrl, stats: cardDefinition.stats }
        : null,
      moments: publicMoments,
    },
  };
}
