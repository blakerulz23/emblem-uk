import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export async function POST(request: NextRequest) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const body = await request.json().catch(() => null) as { staffProfileId?: unknown; permission?: unknown } | null;
  const staffProfileId = typeof body?.staffProfileId === 'string' ? body.staffProfileId : null;
  const permission = body?.permission === 'squad_invite_reviewer' || body?.permission === 'squad_invite_approver' ? body.permission : null;
  if (!staffProfileId || !permission) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('grant_squad_invite_staff_permission', {
    p_staff_profile_id: staffProfileId, p_permission: permission, p_granted_by_staff_profile_id: staff.userId,
  });
  if (error) return NextResponse.json({ error: error.message || 'Could not grant this permission' }, { status: 409 });
  return NextResponse.json({ ok: true, result: data });
}
