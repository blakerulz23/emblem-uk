import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/require-staff';
import { hasSafeRequestOrigin } from '@/lib/squad-invite-request-security';
import { MAX_COMMISSION_BPS, MAX_CUSTOMER_DISCOUNT_BPS, normalizePartnerCode } from '@/lib/partner-programme';

export const runtime = 'nodejs';

type Action =
  | { action: 'approve' | 'reject' | 'pause' | 'reactivate' }
  | { action: 'set_rates'; commissionBps: number; customerDiscountBps: number }
  | { action: 'add_code'; code: string }
  | { action: 'set_code_active'; code: string; active: boolean }
  | { action: 'set_notes'; notes: string };

const STATUS_BY_ACTION = { approve: 'active', reject: 'rejected', pause: 'paused', reactivate: 'active' } as const;

function isBps(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

/**
 * POST /api/staff/partners/[id] — every staff change to one UK partner.
 *
 * add_code records a code staff have ALREADY created in Shopify Admin (a
 * percentage discount on the UK card variant only, not combinable). The
 * code takes the partner's current customer discount, which must match
 * the Shopify discount exactly: orders/paid accepts that percentage and
 * nothing else, so a mismatch leaves the order unpaid with a staff alert
 * rather than silently accepting the wrong price.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: 'Request unavailable' }, { status: 403 });
  }
  const staffCheck = await requireStaff(createClient());
  if (!staffCheck.ok) {
    return NextResponse.json({ error: staffCheck.error }, { status: staffCheck.status });
  }

  const body = (await request.json().catch(() => null)) as Action | null;
  const service = createServiceRoleClient();
  const now = new Date().toISOString();

  const { data: partner } = await service.from('partners').select('id, status, customer_discount_bps').eq('id', params.id).maybeSingle();
  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }

  switch (body?.action) {
    case 'approve':
    case 'reject':
    case 'pause':
    case 'reactivate': {
      const { error } = await service
        .from('partners')
        .update({ status: STATUS_BY_ACTION[body.action], reviewed_by: staffCheck.userId, reviewed_at: now, updated_at: now })
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: 'Could not update the partner' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    case 'set_rates': {
      if (!isBps(body.commissionBps, MAX_COMMISSION_BPS) || !isBps(body.customerDiscountBps, MAX_CUSTOMER_DISCOUNT_BPS)) {
        return NextResponse.json({ error: 'Rates must be between 0% and 50%' }, { status: 400 });
      }
      const { error } = await service
        .from('partners')
        .update({ commission_bps: body.commissionBps, customer_discount_bps: body.customerDiscountBps, updated_at: now })
        .eq('id', params.id);
      if (error) return NextResponse.json({ error: 'Could not update the rates' }, { status: 500 });
      return NextResponse.json({ ok: true, note: 'Existing codes keep their discount. Change the Shopify discount and add a new code if the customer discount changed.' });
    }
    case 'add_code': {
      const code = normalizePartnerCode(body.code);
      if (!code) return NextResponse.json({ error: 'Codes are 3–20 letters or digits' }, { status: 400 });
      if (partner.status !== 'active') return NextResponse.json({ error: 'Approve the partner before adding a code' }, { status: 409 });
      const { error } = await service
        .from('partner_codes')
        .insert({ code, partner_id: params.id, discount_bps: partner.customer_discount_bps, created_by: staffCheck.userId });
      if (error) {
        const taken = error.code === '23505';
        return NextResponse.json({ error: taken ? 'That code is already recorded' : 'Could not add the code' }, { status: taken ? 409 : 500 });
      }
      return NextResponse.json({ ok: true });
    }
    case 'set_code_active': {
      const code = normalizePartnerCode(body.code);
      if (!code || typeof body.active !== 'boolean') return NextResponse.json({ error: 'Invalid code change' }, { status: 400 });
      const { error } = await service.from('partner_codes').update({ active: body.active }).eq('code', code).eq('partner_id', params.id);
      if (error) return NextResponse.json({ error: 'Could not update the code' }, { status: 500 });
      return NextResponse.json({ ok: true, note: body.active ? undefined : 'Also deactivate the code in Shopify Admin, or customers can still use it.' });
    }
    case 'set_notes': {
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
      const { error } = await service.from('partners').update({ staff_notes: notes || null, updated_at: now }).eq('id', params.id);
      if (error) return NextResponse.json({ error: 'Could not save the notes' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
