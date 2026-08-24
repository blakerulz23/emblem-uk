import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { deleteObject } from '@/lib/s3-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Performs real, server-enforced child-data erasure (migration 0076) —
 * this used to be a bare attestation that a human had already carried out
 * the manual runbook (docs/pilot/child-data-deletion-runbook.md); it is
 * now the actual authoritative execution step, staff-triggered with an
 * explicit note, database-enforced (confirm/finalize are both staff-only
 * SECURITY DEFINER RPCs), never a client-controlled storage-key delete —
 * the RPC alone decides what gets inventoried, this route only reports the
 * real outcome for exactly the keys the RPC named.
 *
 * Three systems, sequenced deliberately: (1) confirm_player_deletion_
 * erasure does every DB-side step (delete the player row and its
 * cascades, revoke every card, strip card_definitions.photo) and returns
 * the exact storage inventory — the only point after which the keys still
 * exist to collect at all; (2) this route attempts a real S3 delete for
 * each one, recording success/failure per object; (3) finalize_player_
 * deletion_erasure only ever marks the request `completed` once every
 * object is genuinely gone — if any storage delete failed, it reports
 * `failed` instead, safe to retry (calling this route again re-attempts
 * only what didn't finish, via confirm's own `resumed` branch).
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

  const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_player_deletion_erasure', {
    p_request_id: params.id,
    p_completion_note: note,
  });
  if (confirmError) {
    if (confirmError.message.includes('Staff access required') || confirmError.message.includes('Not authorized')) {
      return NextResponse.json({ error: confirmError.message }, { status: 403 });
    }
    return NextResponse.json({ error: confirmError.message }, { status: 400 });
  }

  const result = confirmResult as { alreadyCompleted: boolean; resumed?: boolean; inventory: { id: string; s3Key: string; kind: string }[] };
  if (result.alreadyCompleted) {
    return NextResponse.json({ ok: true, state: 'completed' });
  }

  // player_deletion_storage_objects grants select/insert/update to
  // service_role only (0076) — never to authenticated, even a staff
  // session — so these status writes must go through the service-role
  // client. requireStaff() above is what actually authorises this route;
  // this client is not a new authorization boundary, the same pattern
  // every other staff route in this codebase already uses.
  const serviceRole = createServiceRoleClient();

  for (const object of result.inventory) {
    try {
      await deleteObject(object.s3Key);
      await serviceRole
        .from('player_deletion_storage_objects')
        .update({ status: 'deleted', deleted_at: new Date().toISOString() })
        .eq('id', object.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown S3 error';
      await serviceRole
        .from('player_deletion_storage_objects')
        .update({ status: 'failed', last_error: message, attempts: 1 })
        .eq('id', object.id);
    }
  }

  const { data: finalizeResult, error: finalizeError } = await supabase.rpc('finalize_player_deletion_erasure', {
    p_request_id: params.id,
  });
  if (finalizeError) {
    return NextResponse.json({ error: finalizeError.message }, { status: 400 });
  }

  const outcome = finalizeResult as { completed: boolean; state?: string };
  return NextResponse.json({ ok: true, ...outcome });
}
