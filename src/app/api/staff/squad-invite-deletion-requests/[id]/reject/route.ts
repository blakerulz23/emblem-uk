import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { readPendingDeletionRequestContact } from '@/lib/deletion-request-contact';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 });
  }

  // There is no staff page for these requests: the address (cleared by the
  // database as the request closes, 0097) is returned once, for the reply.
  const contactEmail = await readPendingDeletionRequestContact(createServiceRoleClient(), 'squad_invite_participation_deletion_requests', params.id);

  const { error } = await supabase.rpc('staff_reject_squad_invite_participation_deletion_request', {
    p_request_id: params.id,
    p_rejection_reason: reason,
  });
  if (error) {
    if (error.message.includes('Staff access required')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, contactEmail });
}
