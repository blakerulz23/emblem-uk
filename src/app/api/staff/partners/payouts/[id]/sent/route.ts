import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';

export const runtime = 'nodejs';

/** POST /api/staff/partners/payouts/[id]/sent — records that the bank transfer went, with its reference. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = await request.json().catch(() => null);
  const reference = typeof body?.reference === 'string' ? body.reference.trim().slice(0, 100) : '';
  if (!reference) {
    return NextResponse.json({ error: 'Enter the bank-transfer reference' }, { status: 400 });
  }

  const { data, error } = await createServiceRoleClient()
    .from('partner_payouts')
    .update({ sent_at: new Date().toISOString(), sent_reference: reference })
    .eq('id', params.id)
    .is('sent_at', null)
    .select('id');
  if (error) {
    return NextResponse.json({ error: 'Could not mark the payout sent' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Payout not found or already marked sent' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
