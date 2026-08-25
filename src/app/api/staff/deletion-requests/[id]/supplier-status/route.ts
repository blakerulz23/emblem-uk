import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

const SUPPLIERS = ['shopify', 'resend', 'printer', 'courier', 'google_gemini', 'aws_s3', 'supabase', 'vercel'] as const;
const STATUSES = ['not_applicable', 'request_required', 'requested_with_date', 'confirmed_deleted', 'expires_under_retention', 'unresolved'] as const;
const MAX_NOTE_LENGTH = 500;

/**
 * A truthful, bounded per-supplier deletion checklist (founder decision 9)
 * — never a raw child identifier. `note` is free text but hard-capped at
 * the same length the table's own CHECK constraint enforces (0076);
 * nothing about this route or the schema can verify staff didn't type a
 * child's name into it, so the doc comment on the table and this route is
 * the actual control — never paste a name, photo reference, or storage
 * key into this field.
 *
 * finalize_player_deletion_erasure (0076) refuses to mark a request
 * completed while any row here is still 'unresolved', 'request_required',
 * or 'requested_with_date' — this route is how that state actually
 * changes.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staffCheck = await requireStaff(supabase);
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const supplier = body?.supplier;
  const status = body?.status;
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : null;
  const requestedAt = typeof body?.requestedAt === 'string' ? body.requestedAt : null;
  const expiresAt = typeof body?.expiresAt === 'string' ? body.expiresAt : null;

  if (!SUPPLIERS.includes(supplier)) {
    return NextResponse.json({ error: 'Invalid supplier' }, { status: 400 });
  }
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { data: request_, error: fetchError } = await serviceRole
    .from('player_deletion_requests')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!request_) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const { error } = await serviceRole
    .from('player_deletion_supplier_status')
    .upsert(
      {
        request_id: params.id,
        supplier,
        status,
        note,
        requested_at: requestedAt,
        expires_at: expiresAt,
        updated_by: staffCheck.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'request_id,supplier' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
