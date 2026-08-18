import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { createSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';
import { dispatchSquadInviteNotification } from '@/lib/dispatch-squad-invite-notification';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = createClient();
  const staff = await requireSquadInvitePermission(auth, 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const credential = createSquadInviteLinkToken();
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('approve_squad_invite_request', {
    p_request_id: params.id, p_staff_profile_id: staff.userId, p_parent_link_hash: credential.hash,
  });
  if (error || !data) return NextResponse.json({ error: 'Squad Invite approval unavailable' }, { status: 409 });
  // The reserved credential is deliberately discarded. Delivery setup later
  // rotates it and returns the newly-created parent link to the organiser.
  // approved_link_ready never contains that link either, for the same
  // reason — see send-squad-invite-notification-email.ts's header comment.
  const { data: r } = await service.from('squad_invite_requests').select('club_team_name,public_reference,organiser_email').eq('id', params.id).maybeSingle();
  if (r) {
    await dispatchSquadInviteNotification(service, {
      requestId: params.id, eventKey: 'approval:v1', template: 'approved_link_ready',
      teamName: r.club_team_name, publicReference: r.public_reference, toEmail: r.organiser_email,
    });
  }
  return NextResponse.json({ ok: true, result: data });
}
