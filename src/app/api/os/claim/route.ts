import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { claimPlayerForCard } from '@/lib/claim-player';

export const runtime = 'nodejs';

type CardLookupRow = {
  id: string;
  status: 'unassigned' | 'assigned' | 'claimed';
  player_id: string | null;
  order_id: string | null;
  orders: { payment_status: string } | null;
  players: {
    name: string;
    position: string | null;
    teams: {
      name: string;
      season: string;
      clubs: { name: string; badge_url: string | null } | null;
    } | null;
  } | null;
};

/**
 * Looks up a card by its claim_token — service-role client, since an
 * unclaimed card is invisible to everyone under normal RLS (the requester
 * has no relationship to the player yet; that's the whole point of a claim
 * code). No session required to call this: it matches "look up before
 * auth," and this route's own rate limiting is the abuse control, not
 * authentication.
 */
export async function GET(request: NextRequest) {
  const identifier = getRequestIdentifier(request);
  if (!(await isWithinRateLimit(identifier))) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const rawCode = request.nextUrl.searchParams.get('code');
  if (!rawCode) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(rawCode);

  const serviceRole = createServiceRoleClient();
  const { data } = await serviceRole
    .from('cards')
    .select(
      `id, status, player_id, order_id,
       orders ( payment_status ),
       players ( name, position,
         teams ( name, season, clubs ( name, badge_url ) )
       )`
    )
    .eq('claim_token', code)
    .neq('status', 'unassigned')
    .maybeSingle<CardLookupRow>();

  // A card produced by a team/squad order isn't claimable until staff
  // approves that order on /staff/queue ("team enquiries create
  // provisional records that aren't claimable until approved") — a card
  // with no order_id at all (e.g. a coach's manual "+Add Player") has
  // nothing to approve and is claimable immediately.
  const orderApproved = !data?.order_id || data.orders?.payment_status === 'fulfilled';
  const found = !!data && orderApproved;

  await logClaimAttempt(identifier, code, found);

  if (!found || !data) {
    return NextResponse.json({ found: false });
  }

  if (data.status === 'claimed') {
    // Tightened multi-guardian rule: a second attempt with the same
    // permanent claim_token never re-discloses player identity — only an
    // existing guardian's invite can add another guardian from here.
    return NextResponse.json({ found: true, alreadyClaimed: true });
  }

  const player = data.players;
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  return NextResponse.json({
    found: true,
    alreadyClaimed: false,
    claimToken: code,
    player: {
      firstName,
      lastInitial,
      team: player?.teams ? { name: player.teams.name, season: player.teams.season } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  });
}

/**
 * Confirms a claim — requires auth. Re-verifies the card is still
 * `assigned` (defense against a race between two people claiming the same
 * code at once), links the guardian, flips the card to `claimed`, and sets
 * the profile's role. The guardians insert and card-status update both run
 * via the service-role client, immediately after this route's own
 * verification — RLS's "guardians: a parent can link themselves" policy is
 * a baseline backstop, not the authoritative check here (RLS can't see
 * whether the right code was presented, only stored row state).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { claimToken } = body as { claimToken?: string };
  if (!claimToken) {
    return NextResponse.json({ error: 'claimToken is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(claimToken);

  const serviceRole = createServiceRoleClient();
  const { data: card } = await serviceRole
    .from('cards')
    .select('id, status, player_id')
    .eq('claim_token', code)
    .maybeSingle();

  if (!card) {
    return NextResponse.json({ error: "This code isn't valid or has already been claimed" }, { status: 400 });
  }

  // guardians.profile_id is a foreign key into profiles — a brand-new
  // account has no profiles row yet, so this upsert must happen before
  // claimPlayerForCard's guardians insert, not after.
  const { error: roleError } = await supabase.from('profiles').upsert({ id: user.id, role: 'parent' });
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const result = await claimPlayerForCard(serviceRole, card, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, playerId: result.playerId });
}
