import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const staff = await requireStaff(auth);
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await service.from('squad_invites').update({
    campaign_status: 'active', approved_by_staff_profile_id: staff.userId, approved_at: now, published_at: now,
  }).eq('id', params.id).eq('campaign_status', 'awaiting_staff_approval').select('id,public_id').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not approve campaign' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Campaign is not awaiting approval' }, { status: 409 });
  await service.from('squad_invite_audit_events').insert({
    campaign_id: data.id, actor_profile_id: staff.userId, actor_role: 'staff', event_type: 'campaign_approved',
  });
  return NextResponse.json({ ok: true, publicId: data.public_id });
}
