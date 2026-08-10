import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

/**
 * Records that staff finished the one remaining step for a stuck guardian
 * account deletion (Supabase Auth Admin → delete that user) by hand —
 * this route does not call the Auth admin API itself; staff do that
 * directly in the Supabase dashboard (or via a one-off script using the
 * auth_user_id shown on this row), then come back here to acknowledge it.
 * Same "record the fact, never perform the action" boundary as
 * player_deletion_requests' own "Mark completed".
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!note) {
    return NextResponse.json({ error: 'A confirmation note is required.' }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole
    .from('pending_auth_deletions')
    .update({
      status: 'resolved',
      resolved_by: staffCheck.userId,
      resolved_at: new Date().toISOString(),
      notes: note,
    })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
