import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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

  // Same atomic-increment RPC pattern as /api/staff/deletion-requests/
  // [id]/complete — record_squad_invite_deletion_storage_attempt does a
  // single `attempts = attempts + 1` update, staff-gated, never a
  // client-supplied count.
  for (const object of result.inventory) {
    try {
      await deleteObject(object.s3Key);
      await supabase.rpc('record_squad_invite_deletion_storage_attempt', {
        p_object_id: object.id,
        p_deleted: true,
        p_error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown S3 error';
      await supabase.rpc('record_squad_invite_deletion_storage_attempt', {
        p_object_id: object.id,
        p_deleted: false,
        p_error: message,
      });
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
