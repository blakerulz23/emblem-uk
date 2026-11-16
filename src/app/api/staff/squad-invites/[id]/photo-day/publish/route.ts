import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { isUuid, photoDayReasonMessage, readRpcOutcome } from '@/lib/photo-day';

/**
 * Releases matched photos to parents (publish_photo_day, migration 0106).
 * Approver: from this moment each parent sees the photos matched to their
 * child, so a second, more senior look is the point. Also kills the
 * photographer link. Unmatching still works afterwards to fix a mistake.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const service = createServiceRoleClient();
  const { data: day } = await service.from('squad_invite_photo_days').select('id').eq('campaign_id', params.id).maybeSingle();
  if (!day) return NextResponse.json({ error: photoDayReasonMessage('photo_day_not_found') }, { status: 404 });
  const { data, error } = await service.rpc('publish_photo_day', { p_photo_day_id: day.id, p_staff_profile_id: staff.userId });
  if (error) return NextResponse.json({ error: 'The photo day could not be published' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}
