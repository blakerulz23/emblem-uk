import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
  // service_role only (0076) — never a direct client write, even from a
  // staff session. The status/attempts write goes through
  // record_player_deletion_storage_attempt, a staff-gated SECURITY
  // DEFINER RPC that does a single atomic `attempts = attempts + 1`
  // update, so this route never reads-then-writes a count that a
  // concurrent retry could race. requireStaff() above is what actually
  // authorises this route; the RPC's own staff_accounts check is a second,
  // independent gate rather than a new authorization boundary.
  for (const object of result.inventory) {
    try {
      await deleteObject(object.s3Key);
      await supabase.rpc('record_player_deletion_storage_attempt', {
        p_object_id: object.id,
        p_deleted: true,
        p_error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown S3 error';
      await supabase.rpc('record_player_deletion_storage_attempt', {
        p_object_id: object.id,
        p_deleted: false,
        p_error: message,
      });
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
