import { createServiceRoleClient } from '@/lib/supabase/server';

type CardLookupRow = {
  id: string;
  status: 'unassigned' | 'assigned' | 'claimed';
  player_id: string | null;
  order_id: string | null;
  access_status: 'suspended' | 'revoked' | null;
  orders: { payment_status: string } | null;
  players: {
    name: string;
    position: string | null;
    public_player_id: string | null;
    teams: {
      name: string;
      clubs: { name: string; badge_url: string | null } | null;
      seasons: { label: string } | null;
    } | null;
  } | null;
};

export type CardLookupResult =
  | { status: 'not_found' }
  | { status: 'unclaimed'; claimToken: string; player: { firstName: string; lastInitial: string; team: { name: string; season?: string } | null; club: { name: string; badgeUrl: string | null } | null } }
  | { status: 'claimed'; playerId: string; publicPlayerId: string }
  | { status: 'claimed_unavailable' }
  // Card lifecycle controls (migration 0075): a suspended or revoked card
  // resolves here regardless of its unassigned/assigned/claimed progress,
  // BEFORE any player preview data is ever read out of `data`. cardId and
  // playerId are only ever used server-side (to check whether the tapper
  // is the linked guardian, and to target the card in a status-management
  // API call) — never serialized into an unauthenticated HTTP response.
  | { status: 'card_unavailable'; cardId: string; playerId: string | null; accessStatus: 'suspended' | 'revoked' };

/**
 * The one place a card's claim_token is resolved — shared by GET
 * /api/os/claim (used for the unclaimed flow's manual/auto code entry) and
 * src/app/os/page.tsx's server-side redirect check for a physical tap.
 * Deliberately has no opinion on rate limiting or session state; callers
 * own that (the API route rate-limits by IP via claim_attempts; page.tsx
 * does the same with its own identifier).
 *
 * This function itself still resolves no capability/guardian relationship —
 * it only answers "is this card claimed, and if so, what's its player and
 * public identity." page.tsx is the one place that combines this with the
 * caller's session to decide whether to render the OS directly or redirect
 * to the public profile (see resolvePlayerCapabilities in
 * player-capabilities.ts).
 */
export async function resolveCardCode(code: string): Promise<CardLookupResult> {
  const serviceRole = createServiceRoleClient();
  const { data } = await serviceRole
    .from('cards')
    .select(
      `id, status, player_id, order_id, access_status,
       orders ( payment_status ),
       players ( name, position, public_player_id,
         teams ( name, clubs ( name, badge_url ), seasons ( label ) )
       )`
    )
    .eq('claim_token', code)
    .neq('status', 'unassigned')
    .maybeSingle<CardLookupRow>();

  if (!data) {
    return { status: 'not_found' };
  }

  // Suspended/revoked is checked first, before the order-approval check and
  // before any preview data is read out of `data` below — a lifecycle-
  // gated card must never expose so much as a first-name preview, and this
  // takes priority regardless of how far along its unassigned/assigned/
  // claimed progress otherwise is. See os/page.tsx for how the caller
  // decides between the guardian-facing reassurance screen and the fully
  // generic response everyone else gets.
  if (data.access_status === 'suspended' || data.access_status === 'revoked') {
    return { status: 'card_unavailable', cardId: data.id, playerId: data.player_id, accessStatus: data.access_status };
  }

  // A card produced by a team/squad order isn't claimable until staff
  // approves that order on /staff/queue — a card with no order_id at all
  // (e.g. a coach's manual "+Add Player") has nothing to approve and is
  // claimable immediately.
  const orderApproved = !data.order_id || data.orders?.payment_status === 'fulfilled';
  if (!orderApproved) {
    return { status: 'not_found' };
  }

  if (data.status === 'claimed') {
    // Deliberately does NOT check public_id_enabled — that flag governs
    // whether a stranger can view /player/[publicPlayerId] (enforced there,
    // by getPublicPlayerProfile), not whether this claim_token resolves to
    // a player at all. A guardian tapping their own physical card must
    // always reach their OS regardless of their current Share Profile
    // setting (src/app/os/page.tsx branches on capabilities.isGuardian,
    // never on this flag) — conflating the two here previously meant a
    // guardian who hadn't (yet, or no longer) enabled sharing would be
    // permanently locked out of tapping back into their own player.
    if (!data.player_id || !data.players?.public_player_id) {
      return { status: 'claimed_unavailable' };
    }
    return { status: 'claimed', playerId: data.player_id, publicPlayerId: data.players.public_player_id };
  }

  const player = data.players;
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  return {
    status: 'unclaimed',
    claimToken: code,
    player: {
      firstName,
      lastInitial,
      team: player?.teams ? { name: player.teams.name, season: player.teams.seasons?.label } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  };
}
