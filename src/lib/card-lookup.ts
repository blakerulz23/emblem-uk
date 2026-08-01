import { createServiceRoleClient } from '@/lib/supabase/server';

type CardLookupRow = {
  id: string;
  status: 'unassigned' | 'assigned' | 'claimed';
  player_id: string | null;
  order_id: string | null;
  orders: { payment_status: string } | null;
  players: {
    name: string;
    position: string | null;
    public_player_id: string | null;
    public_id_enabled: boolean;
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
  | { status: 'claimed_unavailable' };

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
      `id, status, player_id, order_id,
       orders ( payment_status ),
       players ( name, position, public_player_id, public_id_enabled,
         teams ( name, clubs ( name, badge_url ), seasons ( label ) )
       )`
    )
    .eq('claim_token', code)
    .neq('status', 'unassigned')
    .maybeSingle<CardLookupRow>();

  // A card produced by a team/squad order isn't claimable until staff
  // approves that order on /staff/queue — a card with no order_id at all
  // (e.g. a coach's manual "+Add Player") has nothing to approve and is
  // claimable immediately.
  const orderApproved = !data?.order_id || data.orders?.payment_status === 'fulfilled';
  if (!data || !orderApproved) {
    return { status: 'not_found' };
  }

  if (data.status === 'claimed') {
    if (!data.player_id || !data.players?.public_player_id || !data.players.public_id_enabled) {
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
