import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { deleteObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Staff-triggered execution of a Squad Invite participation erasure
 * (migration 0076) — the parallel path to /api/staff/deletion-requests/
 * [id]/complete. Same three-system sequencing: confirm (DB erasure +
 * inventory) -> real S3 deletes here -> finalize (only reports completed
 * once storage is genuinely gone).
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
    return NextResponse.json({ error: 'A completion note is required.' }, { status: 400 });
  }

  const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_squad_invite_participation_erasure', {
    p_request_id: params.id,
    p_completion_note: note,
  });
  if (confirmError) {
    if (confirmError.message.includes('Staff access required') || confirmError.message.includes('Not authorized')) {
      return NextResponse.json({ error: confirmError.message }, { status: 403 });
    }
    return NextResponse.json({ error: confirmError.message }, { status: 400 });
  }

  const result = confirmResult as { alreadyCompleted: boolean; inventory: { id: string; s3Key: string; kind: string }[] };
  if (result.alreadyCompleted) {
    return NextResponse.json({ ok: true, state: 'completed' });
  }

  const serviceRole = createServiceRoleClient();
  for (const object of result.inventory) {
    try {
      await deleteObject(object.s3Key);
      await serviceRole
        .from('squad_invite_participation_deletion_storage_objects')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', object.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown S3 error';
      await serviceRole
        .from('squad_invite_participation_deletion_storage_objects')
        .update({ status: 'failed', last_error: message, attempts: 1 })
        .eq('id', object.id);
    }
  }

  const { data: finalizeResult, error: finalizeError } = await supabase.rpc('finalize_squad_invite_participation_erasure', {
    p_request_id: params.id,
  });
  if (finalizeError) {
    return NextResponse.json({ error: finalizeError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...(finalizeResult as { completed: boolean; state?: string }) });
}
