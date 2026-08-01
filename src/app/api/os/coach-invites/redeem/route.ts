import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';
import { generateStoryUpdate } from '@/lib/story-updates';

export const runtime = 'nodejs';

type CoachInviteLookupRow = {
  id: string;
  used_at: string | null;
  used_by: string | null;
  expires_at: string;
  player_id: string;
  created_by: string;
  players: {
    name: string;
    teams: {
      name: string;
      clubs: { name: string; badge_url: string | null } | null;
      seasons: { label: string } | null;
    } | null;
  } | null;
};

/**
 * Public lookup for a coach invite code — the redeemer (a coach) has no
 * relationship to the player yet, so this uses the service-role client,
 * same reasoning as player_invites'/team_invites' own redeem GETs. Shares
 * the claim_attempts rate-limit log with every other code type.
 *
 * Returns only firstName + lastInitial (never the full name) plus
 * team/club context if the player has one — same minimum-disclosure shape
 * player_invites/redeem/route.ts already uses, not a full player_id row.
 */
export async function GET(request: NextRequest) {
  const identifier = getRequestIdentifier(request.headers);
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
    .from('coach_invites')
    .select(`id, used_at, used_by, expires_at, player_id, created_by,
       players ( name, teams ( name, clubs ( name, badge_url ), seasons ( label ) ) )`)
    .eq('code', code)
    .maybeSingle<CoachInviteLookupRow>();

  const valid = !!data && !data.used_at && new Date(data.expires_at) > new Date();
  await logClaimAttempt(identifier, code, valid);

  // Invalid, expired, and already-used codes all collapse to the same
  // { found: false } — never distinguishing which, so a lookup can't be
  // used to probe whether a given code once existed.
  if (!valid || !data) {
    return NextResponse.json({ found: false });
  }

  const player = data.players;
  const [firstName, ...rest] = (player?.name ?? '').trim().split(/\s+/);
  const lastInitial = rest.length ? rest[rest.length - 1][0] : '';

  return NextResponse.json({
    found: true,
    inviteCode: code,
    player: {
      firstName,
      lastInitial,
      team: player?.teams ? { name: player.teams.name, season: player.teams.seasons?.label } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  });
}

/**
 * Confirms a coach invite — requires auth. `auth.getUser()` is the only
 * source of the profile_id ever written into coach_players; nothing here
 * accepts a coach profile id from the request body.
 *
 * Email-matching decision (documented explicitly, per the milestone
 * spec): the signed-in account is NOT required to match invited_email.
 * This follows the existing precedent exactly — player_invites/redeem's
 * POST never checks the redeemer's email against invited_email either
 * (see src/app/api/os/invites/redeem/route.ts); invited_email there and
 * here is informational/delivery-targeting only. The code itself is the
 * credential, same as every other invite/claim mechanism in this
 * codebase (card claim_token, player_invites, team_invites) — none of
 * them gate redemption on the signed-in identity matching an email on
 * file. Introducing that check only for coach_invites would be a new,
 * inconsistent security model for one invite type, not a hardening of
 * an existing one.
 *
 * Idempotency: if this exact invite was already used by this exact
 * signed-in coach (e.g. a double-submitted redemption), redemption
 * succeeds again without error — same relationship, same actor, nothing
 * to reject. If it was used by a *different* account, or has expired,
 * it's rejected as invalid. A genuinely new connection that collides
 * with an existing coach_players row (the coach already has a separate,
 * still-valid route to this same player) returns 409.
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
  const { inviteCode, displayName } = body as { inviteCode?: string; displayName?: string };
  if (!inviteCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(inviteCode);

  const serviceRole = createServiceRoleClient();
  const { data: invite } = await serviceRole
    .from('coach_invites')
    .select('id, used_at, used_by, expires_at, player_id, created_by')
    .eq('code', code)
    .maybeSingle();

  if (!invite || new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This invite isn't valid or has expired" }, { status: 400 });
  }

  if (invite.used_at) {
    if (invite.used_by === user.id) {
      // Idempotent re-redemption by the same coach — confirm the
      // connection still exists rather than erroring on an action this
      // account already completed.
      const { data: existingConnection } = await serviceRole
        .from('coach_players')
        .select('player_id')
        .eq('player_id', invite.player_id)
        .eq('profile_id', user.id)
        .maybeSingle();
      if (existingConnection) {
        return NextResponse.json({ ok: true, playerId: invite.player_id, alreadyConnected: true });
      }
    }
    return NextResponse.json({ error: "This invite isn't valid or has expired" }, { status: 400 });
  }

  // coach_players.profile_id is a foreign key into profiles — must exist
  // before the insert below, same reasoning as every other redeem route
  // in this codebase (claim, invites/redeem, team-invites/redeem).
  // displayName is optional and only ever supplied on a brand-new coach's
  // first sign-up through this exact flow (mirrors team-invites/redeem's
  // identical shape) — never overwrites an existing name on a repeat or
  // already-authenticated redemption.
  const profileUpsert: Record<string, unknown> = { id: user.id, role: 'coach' };
  if (displayName?.trim()) profileUpsert.display_name = displayName.trim();
  const { error: roleError } = await supabase.from('profiles').upsert(profileUpsert);
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const { error: connectionError } = await serviceRole.from('coach_players').insert({
    player_id: invite.player_id,
    profile_id: user.id,
    created_via: 'guardian_invite',
    created_by: invite.created_by,
  });

  if (connectionError) {
    if (connectionError.code === '23505') {
      return NextResponse.json({ error: "You're already connected to this player" }, { status: 409 });
    }
    return NextResponse.json({ error: connectionError.message }, { status: 500 });
  }

  const { error: inviteUpdateError } = await serviceRole
    .from('coach_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id);
  if (inviteUpdateError) {
    return NextResponse.json({ error: inviteUpdateError.message }, { status: 500 });
  }

  // Reuses the existing coach_connected event type as-is (already used
  // by team-invites/redeem for the team path) — only fired here, after
  // the coach_players insert and the invite's used_at update have both
  // genuinely succeeded, never for the idempotent alreadyConnected
  // return above (nothing changed there to report).
  const [{ data: guardianRows }, { data: player }, { data: actor }] = await Promise.all([
    serviceRole.from('guardians').select('profile_id').eq('player_id', invite.player_id),
    serviceRole.from('players').select('name').eq('id', invite.player_id).maybeSingle(),
    serviceRole.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
  ]);
  const actorName = actor?.display_name ?? 'A coach';
  const playerName = player?.name ?? 'your player';
  const [firstName] = playerName.trim().split(/\s+/);
  await generateStoryUpdate({
    eventType: 'coach_connected',
    playerId: invite.player_id,
    actorProfileId: user.id,
    recipients: (guardianRows ?? []).map((g) => ({ profileId: g.profile_id, presenceScope: `coach-player:${invite.player_id}` })),
    title: 'Coach Connected',
    body: `${actorName} is now connected as ${firstName}'s coach.`,
  });

  return NextResponse.json({ ok: true, playerId: invite.player_id });
}
