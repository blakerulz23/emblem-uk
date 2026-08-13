import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { createSquadInviteLinkToken } from '@/lib/squad-invite-link';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = createClient();
  const staff = await requireStaff(auth);
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const service = createServiceRoleClient();
  const now = new Date().toISOString();
  const { data, error } = await service.from('squad_invites').update({
    campaign_status: 'active', approved_by_staff_profile_id: staff.userId, approved_at: now, published_at: now,
  }).eq('id', params.id).eq('campaign_status', 'awaiting_staff_approval').select('id,grace_ends_at').maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not approve campaign' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Campaign is not awaiting approval' }, { status: 409 });
  await service.from('squad_invite_audit_events').insert({
    campaign_id: data.id, actor_profile_id: staff.userId, actor_role: 'staff', event_type: 'campaign_approved',
  });
  const credential = createSquadInviteLinkToken();
  const { data: link, error: linkError } = await service.from('squad_invite_links').insert({
    campaign_id: data.id, token_hash: credential.hash, expires_at: data.grace_ends_at,
    created_by_profile_id: staff.userId,
  }).select('id').single();
  if (linkError || !link) return NextResponse.json({ error: 'Campaign approved but invitation link could not be created' }, { status: 500 });
  await service.from('squad_invite_link_audit_events').insert({
    link_id: link.id, campaign_id: data.id, actor_profile_id: staff.userId, event_type: 'created',
  });
  return NextResponse.json({ ok: true, invitationPath: `/squad-invite/access#token=${credential.token}` });
}
