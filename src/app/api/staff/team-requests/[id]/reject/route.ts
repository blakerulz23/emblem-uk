import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff reject a pending team request with a reason the requester sees. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Team request not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 1000) {
    return NextResponse.json({ error: 'A reason (up to 1000 characters) is required' }, { status: 400 });
  }

  const { error } = await createServiceRoleClient().rpc('reject_coach_team_request', {
    p_request_id: params.id,
    p_staff_profile_id: staffCheck.userId,
    p_reason: reason,
  });
  if (error) {
    if (error.message.includes('already')) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.message.includes('not found')) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.message.includes('Not authorized')) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
