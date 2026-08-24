import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

const VALID_REASONS = ['lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other'];

/**
 * Staff-only replacement issuance (migration 0075's create_replacement_card
 * RPC) — triggers real physical-card production, so this is deliberately
 * not guardian-self-service (matches the same boundary revoke_card uses,
 * and the prior discovery pass's own Phase 5 recommendation). The RPC
 * returns the new card's raw claim_token so staff can program the physical
 * card — this is not a new exposure: staff already see every card's
 * claim_token in plaintext on the production queue today
 * (src/app/staff/queue/page.tsx), via the same service-role-mediated path.
 */
type ReplaceBody = { reason?: string | null };

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staff = await requireStaff(supabase);
  if (!staff.ok) {
    return NextResponse.json({ error: staff.error }, { status: staff.status });
  }

  const body = (await request.json().catch(() => ({}))) as ReplaceBody;
  if (body.reason != null && !VALID_REASONS.includes(body.reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('create_replacement_card', {
    p_old_card_id: params.id,
    p_reason: body.reason ?? null,
  });

  if (error) {
    if (error.message.includes('Staff access required')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, newCardId: row?.new_card_id, newClaimToken: row?.new_claim_token });
}
