import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { isUuid, photoDayReasonMessage, readRpcOutcome } from '@/lib/photo-day';

/**
 * Staff match a photo to a child, or undo a match. Reviewer level: this is
 * review work, like the main request review. match_photo_day_photo
 * (migration 0104) re-checks staff, campaign, open participation and
 * unwithdrawn photo_day_photography consent inside one locked transaction.
 * The route also refuses a photo from another campaign's photo day, so a
 * stale page can't act across campaigns.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string; photoId: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_reviewer');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  if (!isUuid(params.id) || !isUuid(params.photoId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown; participationId?: unknown } | null;
  const action = body?.action === 'match' || body?.action === 'unmatch' ? body.action : null;
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const participationId = isUuid(body?.participationId) ? body.participationId : null;
  if (action === 'match' && !participationId) return NextResponse.json({ error: 'Choose a child' }, { status: 400 });

  const service = createServiceRoleClient();
  const { data: day } = await service.from('squad_invite_photo_days').select('id').eq('campaign_id', params.id).maybeSingle();
  if (!day) return NextResponse.json({ error: photoDayReasonMessage('photo_day_not_found') }, { status: 404 });
  const { data: photo } = await service.from('squad_invite_photo_day_photos').select('id')
    .eq('id', params.photoId).eq('photo_day_id', day.id).is('deleted_at', null).maybeSingle();
  if (!photo) return NextResponse.json({ error: photoDayReasonMessage('photo_not_found') }, { status: 404 });

  const { data, error } = action === 'match'
    ? await service.rpc('match_photo_day_photo', {
        p_photo_id: params.photoId, p_participation_id: participationId, p_staff_profile_id: staff.userId,
      })
    : await service.rpc('unmatch_photo_day_photo', { p_photo_id: params.photoId, p_staff_profile_id: staff.userId });
  if (error) return NextResponse.json({ error: 'The photo could not be updated' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}
