import { createServiceRoleClient } from '@/lib/supabase/server';

export type StoryUpdateEventType =
  | 'assessment_shared'
  | 'recognition'
  | 'moment_verified'
  | 'season_focus_added'
  | 'coach_connected'
  | 'moment_uploaded'
  | 'verification_required'
  | 'guardian_connected'
  | 'coach_removed';

export type StoryUpdateCategory = 'coach' | 'collection' | 'family';

const CATEGORY_BY_EVENT: Record<StoryUpdateEventType, StoryUpdateCategory> = {
  assessment_shared: 'coach',
  season_focus_added: 'coach',
  recognition: 'collection',
  moment_verified: 'collection',
  moment_uploaded: 'collection',
  verification_required: 'collection',
  coach_connected: 'family',
  guardian_connected: 'family',
  coach_removed: 'family',
};

/** How long a heartbeat (src/app/os/usePresenceHeartbeat.ts, ~10s interval) stays "present" for. */
const PRESENCE_WINDOW_MS = 25_000;

export type StoryUpdateRecipient = {
  /** The recipient's profiles.id. */
  profileId: string;
  /**
   * The active_viewers.scope this event's content is shown under for this
   * recipient (e.g. `about:<playerId>`, `verify`) — see the roadmap's
   * Locked Decision 4 routing table. If the recipient's own heartbeat has a
   * fresh row for this exact scope, this event is born already-read: they
   * were watching it happen live, so it was never "missed."
   */
  presenceScope: string;
};

/**
 * Always creates one story_updates row per recipient — this is the
 * historical record and it is never skipped. Only the initial `read_at` is
 * conditional: a recipient who was actively viewing the matching content
 * (per active_viewers) gets a pre-read row (exists in history, never
 * badges); everyone else gets a genuinely unread row. Swallows its own
 * errors — a notification failing to generate must never affect the
 * primary write it's attached to, so every call site can simply `await`
 * this without its own try/catch.
 */
export async function generateStoryUpdate(params: {
  eventType: StoryUpdateEventType;
  playerId: string;
  actorProfileId: string;
  recipients: StoryUpdateRecipient[];
  title: string;
  body: string;
  relatedMomentId?: string;
}): Promise<void> {
  if (params.recipients.length === 0) return;

  try {
    const serviceRole = createServiceRoleClient();
    const category = CATEGORY_BY_EVENT[params.eventType];
    const presentSince = new Date(Date.now() - PRESENCE_WINDOW_MS).toISOString();

    // One query for however many distinct scopes this batch touches (almost
    // always 1, since a single event's recipients are all guardians of the
    // same player or all coaches of the same team) rather than one query per
    // recipient.
    const scopes = Array.from(new Set(params.recipients.map((r) => r.presenceScope)));
    const profileIds = params.recipients.map((r) => r.profileId);
    const { data: presentRows } = await serviceRole
      .from('active_viewers')
      .select('profile_id, scope')
      .in('profile_id', profileIds)
      .in('scope', scopes)
      .gte('last_seen_at', presentSince);

    const presentKeys = new Set((presentRows ?? []).map((r) => `${r.profile_id}:${r.scope}`));

    const rows = params.recipients.map((r) => {
      const isPresent = presentKeys.has(`${r.profileId}:${r.presenceScope}`);
      return {
        recipient_profile_id: r.profileId,
        actor_profile_id: params.actorProfileId,
        player_id: params.playerId,
        event_type: params.eventType,
        category,
        title: params.title,
        body: params.body,
        related_moment_id: params.relatedMomentId ?? null,
        read_at: isPresent ? new Date().toISOString() : null,
      };
    });

    const { error } = await serviceRole.from('story_updates').insert(rows);
    if (error) {
      console.error('generateStoryUpdate insert failed', params.eventType, error.message);
    }
  } catch (err) {
    console.error('generateStoryUpdate failed', params.eventType, err);
  }
}
