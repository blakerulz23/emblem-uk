import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Staff remove one direct coach-player connection (coach_players). This is
 * separate from ending a team assignment, which never removes a direct
 * connection. Goes only through remove_direct_coach_link, with the staff
 * session account as the actor and a required reason, both recorded in the
 * relationship audit trail; never a raw table delete.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const playerId = typeof body?.playerId === 'string' ? body.playerId : '';
  const coachProfileId = typeof body?.coachProfileId === 'string' ? body.coachProfileId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!UUID_RE.test(playerId) || !UUID_RE.test(coachProfileId)) {
    return NextResponse.json({ error: 'playerId and coachProfileId are required' }, { status: 400 });
  }
  if (!reason || reason.length > 500) {
    return NextResponse.json({ error: 'A reason (up to 500 characters) is required' }, { status: 400 });
  }

  const { data: result, error } = await createServiceRoleClient().rpc('remove_direct_coach_link', {
    p_player_id: playerId,
    p_coach_profile_id: coachProfileId,
    p_actor_profile_id: staffCheck.userId,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes('Not authorized')) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    return NextResponse.json({ error: 'Could not remove this connection' }, { status: 500 });
  }
  if (result !== 'removed') {
    return NextResponse.json({ error: 'This connection was already removed' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
