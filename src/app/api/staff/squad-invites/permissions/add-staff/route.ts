import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireSquadInvitePermission } from '@/lib/require-squad-invite-permission';
import { isSquadInviteMvpEnabled } from '@/lib/squad-invite-mvp';

export async function POST(request: NextRequest) {
  if (!isSquadInviteMvpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const staff = await requireSquadInvitePermission(createClient(), 'squad_invite_approver');
  if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email.includes('@')) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc('promote_email_to_staff', { p_email: email });
  if (error) return NextResponse.json({ error: error.message || 'Could not add this staff member' }, { status: 409 });
  const result = data as { found: boolean; alreadyStaff?: boolean };
  if (!result.found) {
    return NextResponse.json({ error: 'This email has never signed in to Emblem — they need an account first.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, alreadyStaff: result.alreadyStaff ?? false });
}
