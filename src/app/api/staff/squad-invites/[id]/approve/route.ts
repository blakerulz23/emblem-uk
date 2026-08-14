import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { createSquadInviteLinkToken } from '@/lib/squad-invite-link';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = createClient();
  const staff = await requireSquadInvitePermission(auth, 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const credential = createSquadInviteLinkToken();
  const { data, error } = await createServiceRoleClient().rpc('approve_squad_invite_request', {
    p_request_id: params.id, p_staff_profile_id: staff.userId, p_parent_link_hash: credential.hash,
  });
  if (error || !data) return NextResponse.json({ error: 'Squad Invite approval unavailable' }, { status: 409 });
  // The reserved credential is deliberately discarded. Delivery setup later
  // rotates it and returns the newly-created parent link to the organiser.
  return NextResponse.json({ ok: true, result: data });
}
