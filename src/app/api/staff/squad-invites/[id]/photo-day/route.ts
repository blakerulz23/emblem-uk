import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { isUuid, parsePhotoDayCreateInput, photoDayReasonMessage, readRpcOutcome } from '@/lib/photo-day';

/**
 * Staff add a Photo Day to a campaign (create_squad_invite_photo_day,
 * migration 0105). Approver only: it starts a process that ends with a
 * photographer photographing children.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const input = parsePhotoDayCreateInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: photoDayReasonMessage('invalid_details') }, { status: 400 });

  const { data, error } = await createServiceRoleClient().rpc('create_squad_invite_photo_day', {
    p_campaign_id: params.id,
    p_staff_profile_id: staff.userId,
    p_scheduled_for: input.scheduledFor,
    p_venue_label: input.venueLabel,
    p_photographer_name: input.photographerName,
    p_max_photos: input.maxPhotos,
  });
  if (error) return NextResponse.json({ error: 'The photo day could not be created' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json({ ok: true, photoDayId: outcome.value.photoDayId });
}
