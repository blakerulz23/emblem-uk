import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';

export const runtime = 'nodejs';

const VALID_REASONS = ['lost', 'stolen', 'damaged', 'compromised', 'manufacturing_defect', 'other'];

/**
 * Staff-facing card lifecycle control (migration 0075). Staff may act on
 * ANY card (no ownership check beyond requireStaff) and are the only role
 * that may revoke — suspend_card/unsuspend_card/revoke_card all re-derive
 * staff status from auth.uid() against staff_accounts themselves, so this
 * route's requireStaff() check is a fast, honest 403 rather than the real
 * authorization boundary (same layering every other staff route in this
 * codebase already uses).
 */
type StatusBody = { action?: 'suspend' | 'unsuspend' | 'revoke'; reason?: string | null };

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const staff = await requireStaff(supabase);
  if (!staff.ok) {
    return NextResponse.json({ error: staff.error }, { status: staff.status });
  }

  const body = (await request.json()) as StatusBody;

  if (body.action !== 'suspend' && body.action !== 'unsuspend' && body.action !== 'revoke') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (body.reason != null && !VALID_REASONS.includes(body.reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  }

  const { error } =
    body.action === 'suspend'
      ? await supabase.rpc('suspend_card', { p_card_id: params.id, p_reason: body.reason ?? null })
      : body.action === 'unsuspend'
        ? await supabase.rpc('unsuspend_card', { p_card_id: params.id })
        : await supabase.rpc('revoke_card', { p_card_id: params.id, p_reason: body.reason ?? null });

  if (error) {
    if (error.message.includes('Staff access required') || error.message.includes('Not authorized')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
