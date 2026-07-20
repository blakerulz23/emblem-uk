import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { normalizeClaimCode } from '@/lib/claim-code';
import { getRequestIdentifier, isWithinRateLimit, logClaimAttempt } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type InviteLookupRow = {
  id: string;
  used_at: string | null;
  expires_at: string;
  player_id: string;
  players: {
    name: string;
    teams: { name: string; season: string; clubs: { name: string; badge_url: string | null } | null } | null;
  } | null;
};

/**
 * Redeeming an invite code — the redeemer has no relationship to the
 * player yet (that's the point), so this uses the service-role client,
 * same reasoning as the card claim_token lookup. Shares the
 * claim_attempts rate-limit log with card codes.
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
    .from('player_invites')
    .select(
      `id, used_at, expires_at, player_id,
       players ( name, teams ( name, season, clubs ( name, badge_url ) ) )`
    )
    .eq('code', code)
    .maybeSingle<InviteLookupRow>();

  const valid = !!data && !data.used_at && new Date(data.expires_at) > new Date();
  await logClaimAttempt(identifier, code, valid);

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
      team: player?.teams ? { name: player.teams.name, season: player.teams.season } : null,
      club: player?.teams?.clubs ? { name: player.teams.clubs.name, badgeUrl: player.teams.clubs.badge_url } : null,
    },
  });
}

/** Confirms an invite — requires auth. Single-use: rejects if already used or expired. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json();
  const { inviteCode } = body as { inviteCode?: string };
  if (!inviteCode) {
    return NextResponse.json({ error: 'inviteCode is required' }, { status: 400 });
  }
  const code = normalizeClaimCode(inviteCode);

  const serviceRole = createServiceRoleClient();
  const { data: invite } = await serviceRole
    .from('player_invites')
    .select('id, used_at, expires_at, player_id')
    .eq('code', code)
    .maybeSingle();

  if (!invite || invite.used_at || new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This invite isn't valid or has expired" }, { status: 400 });
  }

  // guardians.profile_id is a foreign key into profiles — must exist
  // before the guardians insert below, same reasoning as /api/os/claim.
  const { error: roleError } = await supabase.from('profiles').upsert({ id: user.id, role: 'parent' });
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const { error: guardianError } = await serviceRole
    .from('guardians')
    .insert({ player_id: invite.player_id, profile_id: user.id });

  if (guardianError) {
    if (guardianError.code === '23505') {
      return NextResponse.json({ error: "You've already got access to this player" }, { status: 409 });
    }
    return NextResponse.json({ error: guardianError.message }, { status: 500 });
  }

  const { error: inviteUpdateError } = await serviceRole
    .from('player_invites')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', invite.id);
  if (inviteUpdateError) {
    return NextResponse.json({ error: inviteUpdateError.message }, { status: 500 });
  }

  // If this invite reached a card that was never independently claimed
  // (e.g. a purchaser's "send to the right parent" handoff before anyone
  // used the original claim_token), lock it now too — the original code
  // shouldn't still work once a guardian is linked via any route.
  await serviceRole
    .from('cards')
    .update({ status: 'claimed' })
    .eq('player_id', invite.player_id)
    .neq('status', 'claimed');

  return NextResponse.json({ ok: true, playerId: invite.player_id });
}
