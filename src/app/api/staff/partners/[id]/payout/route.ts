import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { formatPence, PAYOUT_MINIMUM_PENCE } from '@/lib/partner-programme';

export const runtime = 'nodejs';

/**
 * POST /api/staff/partners/[id]/payout — locks every payable commission
 * (hold passed, order still paid) and puts exactly that set into one payout
 * (create_uk_partner_payout, migration 0095; serialised with refunds and
 * other payouts for the same partner). Staff then send the bank transfer by
 * hand and mark it sent with the reference.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const { data, error } = await createServiceRoleClient().rpc('create_uk_partner_payout', {
    p_partner_id: params.id,
    p_staff_user_id: staffCheck.userId,
  });
  if (error) {
    console.error('staff/partners/payout: rpc failed');
    return NextResponse.json({ error: 'Could not create the payout' }, { status: 500 });
  }
  const result = data as { ok: boolean; reason?: string; amount_pence?: number; payout_id?: string };
  if (!result.ok && result.reason === 'partner_not_found') {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }
  if (!result.ok) {
    return NextResponse.json(
      { error: `Payable balance is ${formatPence(result.amount_pence ?? 0)}; payouts start at ${formatPence(PAYOUT_MINIMUM_PENCE)}.` },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, payoutId: result.payout_id, amountPence: result.amount_pence });
}
