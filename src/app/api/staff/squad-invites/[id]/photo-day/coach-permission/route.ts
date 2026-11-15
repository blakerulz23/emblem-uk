import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { isUuid, photoDayReasonMessage, readRpcOutcome } from '@/lib/photo-day';

/**
 * Staff record that both coaches agreed to matchday photography
 * (confirm_photo_day_coach_permissions, migration 0105). Until this is
 * set, no photographer link can be issued and no upload is accepted.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!hasSafeRequestOrigin(request)) return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null) as { note?: unknown } | null;
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length < 5 || note.length > 300) return NextResponse.json({ error: photoDayReasonMessage('note_required') }, { status: 400 });

  const service = createServiceRoleClient();
  const { data: day } = await service.from('squad_invite_photo_days').select('id').eq('campaign_id', params.id).maybeSingle();
  if (!day) return NextResponse.json({ error: photoDayReasonMessage('photo_day_not_found') }, { status: 404 });
  const { data, error } = await service.rpc('confirm_photo_day_coach_permissions', {
    p_photo_day_id: day.id, p_staff_profile_id: staff.userId, p_note: note,
  });
  if (error) return NextResponse.json({ error: 'Coach permission could not be recorded' }, { status: 500 });
  const outcome = readRpcOutcome(data);
  if (!outcome.ok) return NextResponse.json({ error: photoDayReasonMessage(outcome.reason), reason: outcome.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}
