import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { generatePublicPlayerId, withUniqueCodeRetry } from '@/lib/claim-code';

export const runtime = 'nodejs';

/**
 * The administrative kill switch and rotation control for a player's
 * public identity — the "disabled or rotated administratively if safety or
 * privacy requires it" requirement. Staff-only, same requireStaff gate as
 * every other staff-authorized action (e.g. /api/orders/[id]/approve).
 *
 * Rotate deliberately does not forward the old identifier anywhere — the
 * old public_player_id simply stops resolving (card-lookup.ts /
 * public-player-profile.ts both treat a not-found public_player_id as
 * ok:false). If rotation is happening for a safety reason, a redirect from
 * the old link would defeat the entire point.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json();
  const { action } = body as { action?: 'disable' | 'enable' | 'rotate' };
  if (!action || !['disable', 'enable', 'rotate'].includes(action)) {
    return NextResponse.json({ error: "action must be 'disable', 'enable', or 'rotate'" }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();

  if (action === 'disable' || action === 'enable') {
    const { error } = await serviceRole
      .from('players')
      .update({ public_id_enabled: action === 'enable' })
      .eq('id', params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, publicIdEnabled: action === 'enable' });
  }

  const result = await withUniqueCodeRetry(
    (code) =>
      serviceRole
        .from('players')
        .update({ public_player_id: code, public_id_rotated_at: new Date().toISOString() })
        .eq('id', params.id)
        .select('public_player_id')
        .single(),
    3,
    generatePublicPlayerId
  );
  if (!result.code) {
    return NextResponse.json({ error: 'Could not rotate public identity' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, publicPlayerId: result.code });
}
