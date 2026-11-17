import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { readPendingDeletionRequestContact } from '@/lib/deletion-request-contact';
import { deleteObject } from '@/lib/s3-client';
import { deletePhotoDayObject } from '@/lib/photo-day-storage';

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

  // There is no staff page for these requests: the address (cleared by the
  // database as the request completes, 0097) is returned once, only when
  // this call completed it, for the reply.
  const contactEmail = await readPendingDeletionRequestContact(createServiceRoleClient(), 'squad_invite_participation_deletion_requests', params.id);

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
      // Photo Day photos live in their own bucket (see photo-day-storage.ts).
      if (object.kind === 'photo_day_photo') await deletePhotoDayObject(object.s3Key);
      else await deleteObject(object.s3Key);
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

  const outcome = finalizeResult as { completed: boolean; state?: string };
  return NextResponse.json({ ok: true, ...outcome, ...(outcome.completed === true ? { contactEmail } : {}) });
}
